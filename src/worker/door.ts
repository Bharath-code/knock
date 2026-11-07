import { DurableObject } from "cloudflare:workers";
import { admit, initAdmit, release } from "./admit";
import { writeKnock, type KnockWrite } from "./knocks";

export type KnockResult = { ok: true; token: string } | { ok: false; reason: "duplicate" | "limited" };

export class Door extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initAdmit(ctx.storage.sql);
  }

  ping() {
    return this.ctx.storage.sql.exec<{ ok: number }>("SELECT 1 AS ok").one().ok === 1;
  }

  fetch(req: Request) {
    if (req.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket.", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server!);
    return new Response(null, { status: 101, webSocket: client });
  }

  announce() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send('{"type":"knock"}');
      } catch {
        ws.close();
      }
    }
  }

  async knock(k: KnockWrite, ip: string): Promise<KnockResult> {
    const sql = this.ctx.storage.sql;
    const verdict = admit(sql, k.key, ip);
    if (verdict !== "ok") return { ok: false, reason: verdict };
    try {
      const token = await writeKnock(this.env.DB, k);
      this.announce();
      return { ok: true, token };
    } catch (e) {
      // D1's unique (door, person) is the backstop if this Door's memory ever misses a sender
      if (e instanceof Error && /UNIQUE constraint failed: knocks\./.test(e.message)) return { ok: false, reason: "duplicate" };
      release(sql, k.key);
      throw e;
    }
  }
}

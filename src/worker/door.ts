import { DurableObject } from "cloudflare:workers";
import { admit, initAdmit, release } from "./admit";
import { closeExpired, nextExpiry, notifyExpired } from "./expire";
import { writeKnock, type KnockWrite } from "./knocks";

export type KnockResult = { ok: true; token: string; id: string } | { ok: false; reason: "duplicate" | "limited" };

export class Door extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initAdmit(ctx.storage.sql);
  }

  ping() {
    return this.ctx.storage.sql.exec<{ ok: number }>("SELECT 1 AS ok").one().ok === 1;
  }

  // Alarm = the earliest open knock's window end. Re-armed on every knock, every inbox connection
  // (which also heals knocks written before this existed), and after each run.
  async rearm() {
    const id = this.ctx.id.name;
    if (!id) return;
    const next = await nextExpiry(this.env.DB, id);
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(next, Date.now()));
  }

  async alarm() {
    const id = this.ctx.id.name;
    if (!id) return;
    await notifyExpired(this.env.JOBS, await closeExpired(this.env.DB, id));
    await this.rearm();
  }

  async fetch(req: Request) {
    if (req.headers.get("upgrade") !== "websocket") return new Response("Expected a WebSocket.", { status: 426 });
    await this.rearm().catch((e) => console.error("rearm failed", e instanceof Error ? e.message : e));
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
      const { token, id } = await writeKnock(this.env.DB, k);
      // Scored off the request path; the knock shows as "Not scored" until the job lands.
      await this.env.JOBS.send({ type: "rank", knockId: id, doorId: k.doorId }).catch((e) => console.error("rank enqueue failed", e instanceof Error ? e.message : e));
      await this.rearm().catch((e) => console.error("rearm failed", e instanceof Error ? e.message : e));
      this.announce();
      return { ok: true, token, id };
    } catch (e) {
      // D1's unique (door, person) is the backstop if this Door's memory ever misses a sender
      if (e instanceof Error && /UNIQUE constraint failed: knocks\./.test(e.message)) return { ok: false, reason: "duplicate" };
      release(sql, k.key);
      throw e;
    }
  }
}

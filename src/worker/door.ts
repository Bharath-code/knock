import { DurableObject } from "cloudflare:workers";

export class Door extends DurableObject<Env> {
  ping() {
    return this.ctx.storage.sql.exec<{ ok: number }>("SELECT 1 AS ok").one().ok === 1;
  }
}

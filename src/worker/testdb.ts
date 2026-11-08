import { Database } from "bun:sqlite";

export const fakeDb = async () => {
  const sqlite = new Database(":memory:");
  for (const f of ["0001_init", "0003_handles", "0004_code_hash", "0005_sessions", "0006_session_hardening"]) sqlite.run(await Bun.file(`migrations/${f}.sql`).text());
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => ({ results: sqlite.query(sql).all(...(args as never[])) }),
    first: async () => sqlite.query(sql).get(...(args as never[])),
    run: async () => ({ meta: { changes: sqlite.query(sql).run(...(args as never[])).changes } }),
  });
  return {
    sqlite,
    db: {
      prepare: (sql: string) => stmt(sql),
      batch: async (list: { sql: string; run: () => Promise<unknown>; all: () => Promise<object> }[]) => {
        const out = [];
        for (const s of list) out.push(/^\s*SELECT/i.test(s.sql) ? { ...(await s.all()), meta: { changes: 0 } } : await s.run());
        return out;
      },
    } as unknown as D1Database,
  };
};

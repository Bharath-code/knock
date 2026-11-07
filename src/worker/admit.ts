export type SqlLike = { exec(query: string, ...bindings: unknown[]): { toArray(): unknown[] } };

export const KNOCKS_PER_IP_HOUR = 5;
const HOUR_MS = 3_600_000;

export const initAdmit = (sql: SqlLike) => {
  sql.exec("CREATE TABLE IF NOT EXISTS knocked (email_key TEXT PRIMARY KEY)").toArray();
  sql.exec("CREATE TABLE IF NOT EXISTS hits (ip TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, hour))").toArray();
};

export type Verdict = "ok" | "duplicate" | "limited";

// Runs inside one Durable Object per door and touches only its own SQLite synchronously, so two
// requests can never both pass the same check. Attempts count toward the limit, even duplicates.
export const admit = (sql: SqlLike, key: string, ip: string, now = Date.now()): Verdict => {
  const hour = Math.floor(now / HOUR_MS);
  sql.exec("DELETE FROM hits WHERE hour < ?", hour - 24).toArray();
  const row = sql
    .exec("INSERT INTO hits (ip, hour, n) VALUES (?, ?, 1) ON CONFLICT (ip, hour) DO UPDATE SET n = n + 1 RETURNING n", ip, hour)
    .toArray()[0] as { n: number };
  if (row.n > KNOCKS_PER_IP_HOUR) return "limited";
  return sql.exec("INSERT OR IGNORE INTO knocked (email_key) VALUES (?) RETURNING email_key", key).toArray().length ? "ok" : "duplicate";
};

export const release = (sql: SqlLike, key: string) => void sql.exec("DELETE FROM knocked WHERE email_key = ?", key).toArray();

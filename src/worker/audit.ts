import type { OwnerUser } from "./inbox";

// One row per decision, bulk close and setting change. Targets are ids or counts, never message text or emails.
export const logAudit = (db: D1Database, o: OwnerUser, action: string, target: string | null = null, now = Date.now()) =>
  db
    .prepare("INSERT INTO audit_log (id, org_id, actor, action, target, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(crypto.randomUUID(), o.orgId, o.userId, action, target, now)
    .run();

const MAX_ROWS = 10_000;

// Spreadsheets run a cell that starts with = + - or @ as a formula, so those get a leading apostrophe.
export const csvCell = (v: string | number | null) => {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const auditCsv = async (db: D1Database, o: OwnerUser) => {
  const { results } = await db
    .prepare("SELECT at, actor, action, target FROM audit_log WHERE org_id = ?1 ORDER BY at DESC, id LIMIT ?2")
    .bind(o.orgId, MAX_ROWS)
    .all<{ at: number; actor: string; action: string; target: string | null }>();
  return ["time,actor,action,target", ...results.map((r) => [new Date(r.at).toISOString(), r.actor, r.action, r.target].map(csvCell).join(","))].join("\r\n") + "\r\n";
};

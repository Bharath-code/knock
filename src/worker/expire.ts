import { EXPIRED_NOTE, expiredMessage } from "../shared/closure";

export type Expired = { to: string; who: string; k: string };

// One batch: a decision and a status change for every open knock past its window. Expired knocks stay
// out of door_stats.answered_in_window, so the public answer rate counts them as unanswered.
// A null doorId sweeps every door (the cron safety net).
export const closeExpired = async (db: D1Database, doorId: string | null, now = Date.now()): Promise<Expired[]> => {
  const open = `k.status IN ('new', 'seen') AND k.expires_at <= ?1 AND (?2 IS NULL OR k.door_id = ?2)`;
  // The recipients are read in the same batch, before the status change, so each knock is emailed once.
  const [who, , closed] = await db.batch<Expired>([
    db
      .prepare(
        `SELECT p.email AS "to", k.id AS k, COALESCE(NULLIF(op.display_name, ''), '@' || op.handle) AS who
         FROM knocks k JOIN people p ON p.id = k.person_id
         JOIN doors dr ON dr.id = k.door_id JOIN users u ON u.id = dr.owner_user_id JOIN people op ON op.id = u.person_id
         WHERE ${open}`,
      )
      .bind(now, doorId),
    db
      .prepare(`INSERT INTO decisions (id, org_id, knock_id, actor_user_id, answer, reason_code, note, at) SELECT lower(hex(randomblob(16))), k.org_id, k.id, NULL, 'expired', NULL, ?3, ?1 FROM knocks k WHERE ${open}`)
      .bind(now, doorId, EXPIRED_NOTE),
    db.prepare(`UPDATE knocks AS k SET status = 'expired' WHERE ${open}`).bind(now, doorId),
  ]);
  return closed?.meta.changes ? who!.results : [];
};

export const nextExpiry = async (db: D1Database, doorId: string) =>
  (await db.prepare("SELECT MIN(expires_at) AS m FROM knocks WHERE door_id = ?1 AND status IN ('new', 'seen')").bind(doorId).first<{ m: number | null }>())?.m ?? null;

export const notifyExpired = async (jobs: Queue, closed: Expired[]) => {
  for (let i = 0; i < closed.length; i += 100) {
    await jobs.sendBatch(closed.slice(i, i + 100).map((x) => ({ body: { type: "closure", to: x.to, who: x.who, message: expiredMessage(x.who), expired: true, k: x.k } })));
  }
};

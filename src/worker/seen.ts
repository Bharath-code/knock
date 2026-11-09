import { PLACEHOLDER } from "./auth";
import { ensurePrefs } from "./digest";

export type SeenJob = { type: "seen"; knockId: string; to: string; who: string; token: string };

const HEX = /^[0-9a-f]{32}$/;

// One job per newly seen knock whose sender has a real email and has not turned Seen alerts off.
export const seenJobs = async (db: D1Database, ids: string[]): Promise<SeenJob[]> => {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT k.id, k.person_id, s.email AS "to", COALESCE(r.display_name, '@' || r.handle) AS who
       FROM knocks k JOIN people s ON s.id = k.person_id JOIN doors d ON d.id = k.door_id
       JOIN users u ON u.id = d.owner_user_id JOIN people r ON r.id = u.person_id
       LEFT JOIN notification_prefs np ON np.person_id = s.id
       WHERE k.id IN (${marks}) AND s.email NOT LIKE ? AND COALESCE(np.seen_alerts, 1) = 1`,
    )
    .bind(...ids, `%${PLACEHOLDER}`)
    .all<{ id: string; person_id: string; to: string; who: string }>();
  const jobs: SeenJob[] = [];
  for (const r of results) {
    await ensurePrefs(db, r.person_id);
    const t = await db.prepare("SELECT unsub_token FROM notification_prefs WHERE person_id = ?1").bind(r.person_id).first<{ unsub_token: string }>();
    if (t) jobs.push({ type: "seen", knockId: r.id, to: r.to, who: r.who, token: t.unsub_token });
  }
  return jobs;
};

// Skip the email if the receiver already answered or the knock expired; "saw your knock" after a Yes reads as broken.
export const stillSeen = async (db: D1Database, knockId: string) =>
  !!(await db.prepare("SELECT 1 AS ok FROM knocks WHERE id = ?1 AND status = 'seen'").bind(knockId).first());

// Only the Seen alert; the digest switch (digests, unsubscribed_at) stays as it was.
export const seenOff = async (db: D1Database, token: string) =>
  HEX.test(token) && ((await db.prepare("UPDATE notification_prefs SET seen_alerts = 0 WHERE unsub_token = ?1").bind(token).run()).meta.changes ?? 0) > 0;

import { PROFILE_SLUG } from "../shared/door";
import { PLACEHOLDER } from "./auth";
import { RETAIN_DAYS } from "./retention";

// A Not now frees the sender to knock again once the old knock is purged, so the two share one number.
export const REMIND_MS = RETAIN_DAYS * 86_400_000;

export type ReminderJob = { type: "reminder"; to: string; who: string; path: string };

// Due, not yet sent, sender has no knock left on the door (purge ran), door still open, real email.
// Claimed in the same statement, so overlapping cron runs send each reminder once.
export const dueReminders = async (db: D1Database, now: number): Promise<ReminderJob[]> => {
  const { results } = await db
    .prepare(
      `UPDATE reminders SET sent_at = ?1
       WHERE sent_at IS NULL AND remind_at < ?1
         AND NOT EXISTS (SELECT 1 FROM knocks k WHERE k.door_id = reminders.door_id AND k.person_id = reminders.person_id)
         AND door_id IN (SELECT id FROM doors WHERE status = 'open')
         AND person_id IN (SELECT id FROM people WHERE email NOT LIKE ?2)
       RETURNING (SELECT email FROM people WHERE id = person_id) AS "to",
         (SELECT COALESCE(r.display_name, '@' || r.handle) FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people r ON r.id = u.person_id WHERE d.id = door_id) AS who,
         (SELECT CASE WHEN d.slug = ?3 THEN '/d/' || r.handle ELSE '/d/' || r.handle || '/' || d.slug END FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people r ON r.id = u.person_id WHERE d.id = door_id) AS path`,
    )
    .bind(now, `%${PLACEHOLDER}`, PROFILE_SLUG)
    .all<{ to: string; who: string; path: string }>();
  return results.map((r) => ({ type: "reminder", ...r }));
};

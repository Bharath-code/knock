import { PLACEHOLDER } from "./auth";
import { DIGEST_HOUR, ensurePrefs, localHour, validTz } from "./digest";

const DAY = 86_400_000;
const GAP = 6 * DAY;

export type WeeklyJob = { type: "weekly"; to: string; n: number; token: string };

const localMonday = (tz: string | null, now: number) =>
  new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz) ? tz : "UTC", weekday: "short" }).format(now) === "Mon";

// Atomic, so overlapping or retried cron runs send at most one weekly email per week.
const claim = async (db: D1Database, personId: string, now: number) => {
  await ensurePrefs(db, personId);
  const r = await db
    .prepare("UPDATE notification_prefs SET weekly_checked_at = ?2 WHERE person_id = ?1 AND (weekly_checked_at IS NULL OR weekly_checked_at < ?3) RETURNING unsub_token")
    .bind(personId, now, now - GAP)
    .first<{ unsub_token: string }>();
  return r?.unsub_token ?? null;
};

const answered = async (db: D1Database, personId: string, now: number) =>
  (
    await db
      .prepare(
        `SELECT COUNT(*) AS n FROM decisions WHERE answer IN ('yes','later','no','pass') AND at >= ?2
         AND actor_user_id IN (SELECT id FROM users WHERE person_id = ?1)`,
      )
      .bind(personId, now - 7 * DAY)
      .first<{ n: number }>()
  )?.n ?? 0;

// Owners with a real email and a door, digest switch on, not sent in the last 6 days, whose local clock reads Monday 08:00.
export const weeklyJobs = async (db: D1Database, now = Date.now()): Promise<WeeklyJob[]> => {
  const { results } = await db
    .prepare(
      `SELECT p.id AS person_id, p.email, np.tz
       FROM people p JOIN users u ON u.person_id = p.id LEFT JOIN notification_prefs np ON np.person_id = p.id
       WHERE p.email NOT LIKE ?1 AND COALESCE(np.digests, 1) = 1 AND np.unsubscribed_at IS NULL
         AND (np.weekly_checked_at IS NULL OR np.weekly_checked_at < ?2)
         AND EXISTS (SELECT 1 FROM doors d WHERE d.owner_user_id = u.id)`,
    )
    .bind(`%${PLACEHOLDER}`, now - GAP)
    .all<{ person_id: string; email: string; tz: string | null }>();
  const jobs: WeeklyJob[] = [];
  for (const o of results) {
    if (localHour(o.tz, now) !== DIGEST_HOUR || !localMonday(o.tz, now)) continue;
    const token = await claim(db, o.person_id, now);
    if (!token) continue;
    const n = await answered(db, o.person_id, now);
    if (n > 0) jobs.push({ type: "weekly", to: o.email, n, token });
  }
  return jobs;
};

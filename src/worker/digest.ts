import { PLACEHOLDER } from "./auth";
import { stripLinks } from "./email";

export const DIGEST_HOUR = 8;
const DAY = 86_400_000;
const GAP = 20 * 3_600_000;

export const validTz = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// h23, not hour12:false, which some engines render as "24" at midnight.
export const localHour = (tz: string | null, now: number) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz) ? tz : "UTC", hour: "numeric", hourCycle: "h23" }).format(now));

// ponytail: stored in plain text, unlike every other token here, because it can only turn the digest off
const newToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

export const ensurePrefs = (db: D1Database, personId: string) =>
  db
    .prepare("INSERT INTO notification_prefs (person_id, unsub_token) VALUES (?1, ?2) ON CONFLICT(person_id) DO UPDATE SET unsub_token = COALESCE(unsub_token, excluded.unsub_token)")
    .bind(personId, newToken())
    .run();

type Owner = { person_id: string; email: string; tz: string | null; checked: number | null };

// Owners with a real email and a door, digest on, not checked in the last 20 hours, whose local clock reads `hour`.
export const dueOwners = async (db: D1Database, now: number, hour = DIGEST_HOUR) => {
  const { results } = await db
    .prepare(
      `SELECT p.id AS person_id, p.email, np.tz, np.digest_checked_at AS checked
       FROM people p JOIN users u ON u.person_id = p.id LEFT JOIN notification_prefs np ON np.person_id = p.id
       WHERE p.email NOT LIKE ?1 AND COALESCE(np.digests, 1) = 1 AND np.unsubscribed_at IS NULL
         AND (np.digest_checked_at IS NULL OR np.digest_checked_at < ?2)
         AND EXISTS (SELECT 1 FROM doors d WHERE d.owner_user_id = u.id)`,
    )
    .bind(`%${PLACEHOLDER}`, now - GAP)
    .all<Owner>();
  return results.filter((o) => localHour(o.tz, now) === hour);
};

// Atomic, so overlapping or retried cron runs send at most one digest per day.
const claim = async (db: D1Database, personId: string, now: number) => {
  await ensurePrefs(db, personId);
  const r = await db
    .prepare("UPDATE notification_prefs SET digest_checked_at = ?2 WHERE person_id = ?1 AND (digest_checked_at IS NULL OR digest_checked_at < ?3) RETURNING unsub_token")
    .bind(personId, now, now - GAP)
    .first<{ unsub_token: string }>();
  return r?.unsub_token ?? null;
};

export type DigestTop = { door: string; fit: number | null; excerpt: string };
export type DigestJob = { type: "digest"; to: string; fresh: number; open: number; top: DigestTop[]; token: string };

const excerpt = (answersJson: string) => {
  const m = stripLinks((JSON.parse(answersJson) as { message?: string }).message ?? "");
  return m.length > 140 ? `${m.slice(0, 139).trimEnd()}…` : m;
};

// Spam still counts toward the totals but never makes the top three.
export const buildDigest = async (db: D1Database, personId: string, since: number, now: number) => {
  const open = `FROM knocks k JOIN doors d ON d.id = k.door_id
    WHERE d.owner_user_id IN (SELECT id FROM users WHERE person_id = ?1) AND k.status IN ('new', 'seen') AND k.expires_at > ?2`;
  const counts = await db.prepare(`SELECT COUNT(*) AS open, COALESCE(SUM(k.created_at > ?3), 0) AS fresh ${open}`).bind(personId, now, since).first<{ open: number; fresh: number }>();
  const { results } = await db
    .prepare(`SELECT d.slug, d.kind, k.fit, k.answers_json ${open} AND k.created_at > ?3 AND k.spam = 0 ORDER BY k.fit IS NULL, k.fit DESC, k.created_at ASC LIMIT 3`)
    .bind(personId, now, since)
    .all<{ slug: string; kind: string; fit: number | null; answers_json: string }>();
  return {
    open: counts?.open ?? 0,
    fresh: counts?.fresh ?? 0,
    top: results.map((r) => ({ door: r.kind === "profile" ? "Your door" : r.slug, fit: r.fit, excerpt: excerpt(r.answers_json) })),
  };
};

// ponytail: one query pair per due owner; batch by timezone if the 08:00 cron run gets slow
export const digestJobs = async (db: D1Database, now = Date.now(), hour = DIGEST_HOUR): Promise<DigestJob[]> => {
  const jobs: DigestJob[] = [];
  for (const o of await dueOwners(db, now, hour)) {
    const token = await claim(db, o.person_id, now);
    if (!token) continue;
    const d = await buildDigest(db, o.person_id, o.checked ?? now - DAY, now);
    if (d.fresh > 0) jobs.push({ type: "digest", to: o.email, token, ...d });
  }
  return jobs;
};

export const unsubscribe = async (db: D1Database, token: string, now = Date.now()) =>
  /^[0-9a-f]{32}$/.test(token) &&
  ((await db.prepare("UPDATE notification_prefs SET digests = 0, unsubscribed_at = COALESCE(unsubscribed_at, ?2) WHERE unsub_token = ?1").bind(token, now).run()).meta.changes ?? 0) > 0;

export const tokenValid = async (db: D1Database, token: string) =>
  /^[0-9a-f]{32}$/.test(token) && !!(await db.prepare("SELECT 1 AS ok FROM notification_prefs WHERE unsub_token = ?1").bind(token).first());

export const setPrefs = async (db: D1Database, personId: string, p: { tz?: string; digest?: boolean }) => {
  await ensurePrefs(db, personId);
  if (p.tz !== undefined) await db.prepare("UPDATE notification_prefs SET tz = ?2 WHERE person_id = ?1").bind(personId, p.tz).run();
  if (p.digest !== undefined)
    await db.prepare("UPDATE notification_prefs SET digests = ?2, unsubscribed_at = CASE WHEN ?2 = 1 THEN NULL ELSE COALESCE(unsubscribed_at, ?3) END WHERE person_id = ?1").bind(personId, p.digest ? 1 : 0, Date.now()).run();
};

export const digestOn = async (db: D1Database, personId: string) => {
  const r = await db.prepare("SELECT digests, unsubscribed_at FROM notification_prefs WHERE person_id = ?1").bind(personId).first<{ digests: number; unsubscribed_at: number | null }>();
  return !r || (r.digests === 1 && r.unsubscribed_at === null);
};

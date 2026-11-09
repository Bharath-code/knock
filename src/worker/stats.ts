import type { OwnerUser } from "./inbox";

const DAY = 86_400_000;
export const BADGE_MIN_KNOCKS = 10;
export const BADGE_MIN_RATE = 0.8;

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = xs.toSorted((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

// Nightly. Over the last 90 days: answered / (answered + ran out of time) per door, and the median hours to answer.
// The rate stays null under 10 closed knocks, so "hide until enough data" is just a null.
// ponytail: one pass over 90 days of decisions; move to a per-door SQL aggregate if this outgrows a cron run
export const refreshDoorStats = async (db: D1Database, now = Date.now()) => {
  const { results } = await db
    .prepare(
      `SELECT k.door_id AS door, d.answer, k.created_at AS made, k.answered_at AS answered
       FROM decisions d JOIN knocks k ON k.id = d.knock_id
       WHERE d.answer IN ('yes', 'later', 'no', 'expired') AND d.at >= ?1`,
    )
    .bind(now - 90 * DAY)
    .all<{ door: string; answer: string; made: number; answered: number | null }>();
  const by = new Map<string, { total: number; done: number; hours: number[] }>();
  for (const r of results) {
    const s = by.get(r.door) ?? { total: 0, done: 0, hours: [] };
    s.total++;
    if (r.answer !== "expired") {
      s.done++;
      if (r.answered !== null) s.hours.push((r.answered - r.made) / 3_600_000);
    }
    by.set(r.door, s);
  }
  await db.batch([
    db.prepare("UPDATE door_stats SET answer_rate_90d = NULL, median_answer_hours = NULL WHERE answer_rate_90d IS NOT NULL OR median_answer_hours IS NOT NULL"),
    ...[...by].map(([door, s]) =>
      db
        .prepare("UPDATE door_stats SET answer_rate_90d = ?2, median_answer_hours = ?3, updated_at = ?4 WHERE door_id = ?1")
        .bind(door, s.total >= BADGE_MIN_KNOCKS ? s.done / s.total : null, median(s.hours), now),
    ),
  ]);
};

export type BadgeData = { pct: number; days: number };

// Shown only when the owner opted in and the stored rate is at least 80%; below that it disappears by itself.
export const badgeFor = async (db: D1Database, handle: string, slug: string): Promise<BadgeData | null> => {
  const r = await db
    .prepare(
      `SELECT s.answer_rate_90d AS rate, d.window_days AS days
       FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id JOIN door_stats s ON s.door_id = d.id
       WHERE p.handle = ?1 AND d.slug = ?2 AND d.badge_optin = 1 AND d.status = 'open'`,
    )
    .bind(handle, slug)
    .first<{ rate: number | null; days: number }>();
  return r && r.rate !== null && r.rate >= BADGE_MIN_RATE ? { pct: Math.round(r.rate * 100), days: r.days } : null;
};

export type BadgeRow = { doorId: string; slug: string; handle: string | null; optin: boolean; pct: number | null; days: number; shown: boolean };

export const badgeRows = async (db: D1Database, o: OwnerUser): Promise<BadgeRow[]> => {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.slug, p.handle, d.badge_optin AS optin, s.answer_rate_90d AS rate, d.window_days AS days
       FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id LEFT JOIN door_stats s ON s.door_id = d.id
       WHERE d.owner_user_id = ?1 AND d.status = 'open' ORDER BY d.created_at`,
    )
    .bind(o.userId)
    .all<{ id: string; slug: string; handle: string | null; optin: number; rate: number | null; days: number }>();
  return results.map((r) => ({
    doorId: r.id, slug: r.slug, handle: r.handle, optin: r.optin === 1, pct: r.rate === null ? null : Math.round(r.rate * 100), days: r.days,
    shown: r.optin === 1 && r.rate !== null && r.rate >= BADGE_MIN_RATE,
  }));
};

export const setBadge = async (db: D1Database, o: OwnerUser, doorId: string, on: boolean) =>
  ((await db.prepare("UPDATE doors SET badge_optin = ?3 WHERE id = ?1 AND owner_user_id = ?2").bind(doorId, o.userId, on ? 1 : 0).run()).meta.changes ?? 0) === 1;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const badgeSvg = ({ pct, days }: BadgeData) => {
  const left = "Doorbell";
  const right = `${pct}% answered in ${days}d`;
  const lw = 66, rw = Math.round(right.length * 6.4 + 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="22" role="img" aria-label="${esc(`${left}: ${right}`)}"><rect width="${lw}" height="22" rx="4" fill="#44403c"/><rect x="${lw}" width="${rw}" height="22" rx="4" fill="#a16207"/><rect x="${lw}" width="8" height="22" fill="#a16207"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="15">${esc(left)}</text><text x="${lw + rw / 2}" y="15">${esc(right)}</text></g></svg>`;
};

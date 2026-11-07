import { PROFILE_SLUG } from "../shared/door";
import { bookingUrl } from "../shared/booking";
import type { OwnerUser } from "./inbox";

export type YesJob = { type: "yes"; to: string; note: string | null; url: string | null; knockId: string; at: number };

// ponytail: one link per owner, stored on the profile door; per-door overrides when someone asks
export const setBooking = async (db: D1Database, o: OwnerUser, url: string | null) =>
  (
    await db
      .prepare("UPDATE doors SET yes_action_json = ?1 WHERE owner_user_id = ?2 AND slug = ?3")
      .bind(url && JSON.stringify({ type: "booking", url }), o.userId, PROFILE_SLUG)
      .run()
  ).meta.changes === 1;

const read = (json: string | null) => {
  try {
    const a = JSON.parse(json ?? "null") as { type?: string; url?: unknown } | null;
    return a?.type === "booking" ? bookingUrl(a.url) : null;
  } catch {
    return null;
  }
};

export const getBooking = async (db: D1Database, o: OwnerUser) =>
  read(
    (await db.prepare("SELECT yes_action_json AS a FROM doors WHERE owner_user_id = ?1 AND slug = ?2").bind(o.userId, PROFILE_SLUG).first<{ a: string | null }>())?.a ?? null,
  );

export const yesJob = async (db: D1Database, o: OwnerUser, knockId: string, at: number): Promise<YesJob | null> => {
  const r = await db
    .prepare(
      `SELECT p.email AS "to", dec.note AS note,
              (SELECT yes_action_json FROM doors WHERE owner_user_id = ?2 AND slug = '${PROFILE_SLUG}') AS action
       FROM decisions dec JOIN knocks k ON k.id = dec.knock_id JOIN people p ON p.id = k.person_id
       WHERE dec.knock_id = ?1 AND dec.actor_user_id = ?2 AND dec.answer = 'yes' AND dec.at = ?3`,
    )
    .bind(knockId, o.userId, at)
    .first<{ to: string; note: string | null; action: string | null }>();
  return r ? { type: "yes", to: r.to, note: r.note, url: read(r.action), knockId, at } : null;
};

// Undo deletes the decision row, so a Yes that was taken back is skipped here.
export const stillYes = async (db: D1Database, knockId: string, at: number) =>
  (await db.prepare("SELECT 1 AS ok FROM decisions WHERE knock_id = ?1 AND answer = 'yes' AND at = ?2").bind(knockId, at).first()) !== null;

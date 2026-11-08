import type { OwnerUser } from "./inbox";

export type CloseJob = { type: "closure"; to: string; message: string; later: boolean; knockId: string; at: number };

export const knockTemplate = async (db: D1Database, o: OwnerUser, knockId: string) =>
  (
    await db
      .prepare("SELECT d.template FROM knocks k JOIN doors d ON d.id = k.door_id WHERE k.id = ?1 AND d.owner_user_id = ?2")
      .bind(knockId, o.userId)
      .first<{ template: string }>()
  )?.template ?? null;

export const closeJob = async (db: D1Database, o: OwnerUser, knockId: string, at: number): Promise<CloseJob | null> => {
  const r = await db
    .prepare(
      `SELECT p.email AS "to", dec.note AS message, dec.answer AS answer
       FROM decisions dec JOIN knocks k ON k.id = dec.knock_id JOIN people p ON p.id = k.person_id
       WHERE dec.knock_id = ?1 AND dec.actor_user_id = ?2 AND dec.answer IN ('no', 'later') AND dec.at = ?3`,
    )
    .bind(knockId, o.userId, at)
    .first<{ to: string; message: string | null; answer: string }>();
  return r?.message ? { type: "closure", to: r.to, message: r.message, later: r.answer === "later", knockId, at } : null;
};

// Undo deletes the decision row, so a No or Not now that was taken back is skipped.
export const stillAnswered = async (db: D1Database, knockId: string, at: number) =>
  (await db.prepare("SELECT 1 AS ok FROM decisions WHERE knock_id = ?1 AND at = ?2 AND answer IN ('no', 'later')").bind(knockId, at).first()) !== null;

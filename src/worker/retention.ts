import { sha256 } from "./doors";

export const RETAIN_DAYS = 90;
const DAY = 86_400_000;
const BATCH = 500;

const closedBefore = `(status = 'answered' AND COALESCE(answered_at, expires_at) < ?1) OR (status = 'expired' AND expires_at < ?1)`;

// Senders who no longer have any knock and never made a door. Owners keep their person row.
const ORPHANS = `DELETE FROM people WHERE id NOT IN (SELECT person_id FROM users) AND id NOT IN (SELECT person_id FROM knocks) AND id NOT IN (SELECT person_id FROM reminders WHERE sent_at IS NULL)`;

// Decisions, outcomes and passes go with the knock (ON DELETE CASCADE); an assigned invite code stays assigned.
// ponytail: 500 knocks per cron run and a full orphan scan; page by created_at if either shows up in cron time
export const purgeClosed = async (db: D1Database, now = Date.now()) => {
  await db.batch([
    db.prepare(`DELETE FROM knocks WHERE id IN (SELECT id FROM knocks WHERE ${closedBefore} LIMIT ${BATCH})`).bind(now - RETAIN_DAYS * DAY),
    db.prepare(ORPHANS),
  ]);
};

// The status token is the sender's only credential, so holding it is enough to delete.
// An open knock also leaves the door's total, so the public answer rate doesn't count it as unanswered.
export const deleteByToken = async (db: D1Database, token: string) => {
  const hash = await sha256(token);
  const k = await db.prepare("SELECT id, door_id, person_id, status FROM knocks WHERE token_hash = ?1").bind(hash).first<{ id: string; door_id: string; person_id: string; status: string }>();
  if (!k) return null;
  await db.batch([
    ...(k.status === "new" || k.status === "seen"
      ? [db.prepare("UPDATE door_stats SET knocks_total = MAX(knocks_total - 1, 0), updated_at = ?2 WHERE door_id = ?1").bind(k.door_id, Date.now())]
      : []),
    db.prepare("DELETE FROM reminders WHERE knock_id = ?1").bind(k.id),
    db.prepare("DELETE FROM knocks WHERE id = ?1").bind(k.id),
    db.prepare("DELETE FROM people WHERE id = ?1 AND id NOT IN (SELECT person_id FROM users) AND id NOT IN (SELECT person_id FROM knocks)").bind(k.person_id),
  ]);
  return { doorId: k.door_id };
};

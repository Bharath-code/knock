import { CLOSE_MESSAGE, CLOSE_REASON, UNDO_MS, type InboxCard, type Reply } from "../shared/inbox";
import { sha256 } from "./doors";

export type OwnerUser = { userId: string; orgId: string };

export const ownerUser = async (db: D1Database, token: string | undefined): Promise<OwnerUser | null> => {
  if (!token) return null;
  const r = await db
    .prepare("SELECT u.id, u.org_id FROM people p JOIN users u ON u.person_id = p.id WHERE p.owner_token_hash = ?1")
    .bind(await sha256(token))
    .first<{ id: string; org_id: string }>();
  return r ? { userId: r.id, orgId: r.org_id } : null;
};

type Row = {
  id: string; slug: string; kind: string; answers_json: string; proof_url: string | null; fit: number | null;
  spam: number; used_rewrite: number; created_at: number; expires_at: number;
};

// Best fit first, unscored last, then oldest first because the oldest expire first.
export const listInbox = async (db: D1Database, o: OwnerUser, now = Date.now()): Promise<InboxCard[]> => {
  const { results } = await db
    .prepare(
      `SELECT k.id, d.slug, d.kind, k.answers_json, k.proof_url, k.fit, k.spam, k.used_rewrite, k.created_at, k.expires_at
       FROM knocks k JOIN doors d ON d.id = k.door_id
       WHERE d.owner_user_id = ?1 AND k.status IN ('new', 'seen') AND k.expires_at > ?2
       ORDER BY k.fit IS NULL, k.fit DESC, k.created_at ASC`,
    )
    .bind(o.userId, now)
    .all<Row>();
  return results.map((r) => {
    const body = JSON.parse(r.answers_json) as { message?: string; answers?: { q: string; a: string }[] };
    return {
      id: r.id, door: r.kind === "profile" ? "Your door" : r.slug, message: body.message ?? "", answers: body.answers ?? [],
      proof: r.proof_url, fit: r.fit, spam: r.spam === 1, rewrote: r.used_rewrite === 1, createdAt: r.created_at, expiresAt: r.expires_at,
    };
  });
};

const pending = `k.id = ?1 AND k.status IN ('new', 'seen') AND k.expires_at > ?2 AND k.door_id IN (SELECT id FROM doors WHERE owner_user_id = ?3)`;

export const answerKnock = async (db: D1Database, o: OwnerUser, knockId: string, r: Reply, now = Date.now()) => {
  const [first] = await db.batch([
    db
      .prepare(`INSERT INTO decisions (id, org_id, knock_id, actor_user_id, answer, reason_code, note, at) SELECT ?4, k.org_id, k.id, ?3, ?5, ?6, ?7, ?2 FROM knocks k WHERE ${pending}`)
      .bind(knockId, now, o.userId, crypto.randomUUID(), r.answer, r.reason ?? null, r.note || null),
    db
      .prepare(`UPDATE door_stats SET answered_in_window = answered_in_window + 1, updated_at = ?2 WHERE door_id IN (SELECT k.door_id FROM knocks k WHERE ${pending})`)
      .bind(knockId, now, o.userId),
    db
      .prepare(`UPDATE person_stats SET answered = answered + 1, yes_count = yes_count + ?4, updated_at = ?2 WHERE person_id IN (SELECT k.person_id FROM knocks k WHERE ${pending})`)
      .bind(knockId, now, o.userId, r.answer === "yes" ? 1 : 0),
    db
      .prepare(`UPDATE knocks AS k SET status = 'answered', answered_at = ?2, seen_at = COALESCE(seen_at, ?2) WHERE ${pending}`)
      .bind(knockId, now, o.userId),
  ]);
  return (first?.meta.changes ?? 0) === 1;
};

const undoable = `d.knock_id = ?1 AND d.actor_user_id = ?3 AND d.reason_code IS NOT 'bulk' AND d.at > ?2 AND d.id = (SELECT id FROM decisions WHERE knock_id = ?1 ORDER BY at DESC LIMIT 1)`;

export const undoKnock = async (db: D1Database, o: OwnerUser, knockId: string, now = Date.now()) => {
  const since = now - UNDO_MS;
  const dec = `SELECT d.id FROM decisions d WHERE ${undoable} AND d.answer IN ('yes','later','no')`;
  const done = await db.batch([
    db
      .prepare(`UPDATE door_stats SET answered_in_window = MAX(answered_in_window - 1, 0), updated_at = ?2 WHERE door_id IN (SELECT door_id FROM knocks WHERE id = ?1) AND EXISTS (${dec})`)
      .bind(knockId, since, o.userId),
    db
      .prepare(
        `UPDATE person_stats SET answered = MAX(answered - 1, 0), yes_count = MAX(yes_count - (SELECT COUNT(*) FROM decisions d WHERE ${undoable} AND d.answer = 'yes'), 0), updated_at = ?2
         WHERE person_id IN (SELECT person_id FROM knocks WHERE id = ?1) AND EXISTS (${dec})`,
      )
      .bind(knockId, since, o.userId),
    db
      .prepare(`UPDATE knocks SET status = 'seen', answered_at = NULL WHERE id = ?1 AND EXISTS (SELECT 1 FROM decisions d WHERE ${undoable})`)
      .bind(knockId, since, o.userId),
    db.prepare(`DELETE FROM decisions WHERE id IN (${dec})`).bind(knockId, since, o.userId),
  ]);
  return (done[3]?.meta.changes ?? 0) === 1;
};

const open = `k.status IN ('new', 'seen') AND k.expires_at > ?1 AND k.door_id IN (SELECT id FROM doors WHERE owner_user_id = ?2)`;

export type Closure = { to: string; message: string };

// One batch: a decision per open knock, stats, and a single audit row. Returns who to email.
export const closeRest = async (db: D1Database, o: OwnerUser, now = Date.now()): Promise<Closure[]> => {
  const done = await db.batch([
    db
      .prepare(`INSERT INTO audit_log (id, org_id, actor, action, target, at) SELECT ?3, ?4, ?2, 'inbox.close_rest', COUNT(*) || ' knocks', ?1 FROM knocks k WHERE ${open} HAVING COUNT(*) > 0`)
      .bind(now, o.userId, crypto.randomUUID(), o.orgId),
    db
      .prepare(`INSERT INTO decisions (id, org_id, knock_id, actor_user_id, answer, reason_code, note, at) SELECT lower(hex(randomblob(16))), k.org_id, k.id, ?2, 'no', ?3, ?4, ?1 FROM knocks k WHERE ${open}`)
      .bind(now, o.userId, CLOSE_REASON, CLOSE_MESSAGE),
    db
      .prepare(`UPDATE door_stats SET answered_in_window = answered_in_window + (SELECT COUNT(*) FROM knocks k WHERE k.door_id = door_stats.door_id AND ${open}), updated_at = ?1 WHERE door_id IN (SELECT k.door_id FROM knocks k WHERE ${open})`)
      .bind(now, o.userId),
    db
      .prepare(`UPDATE person_stats SET answered = answered + (SELECT COUNT(*) FROM knocks k WHERE k.person_id = person_stats.person_id AND ${open}), updated_at = ?1 WHERE person_id IN (SELECT k.person_id FROM knocks k WHERE ${open})`)
      .bind(now, o.userId),
    db
      .prepare(`UPDATE knocks AS k SET status = 'answered', answered_at = ?1, seen_at = COALESCE(seen_at, ?1) WHERE ${open}`)
      .bind(now, o.userId),
  ]);
  if (!done[1]?.meta.changes) return [];
  const { results } = await db
    .prepare(
      `SELECT p.email AS "to" FROM decisions d JOIN knocks k ON k.id = d.knock_id JOIN people p ON p.id = k.person_id
       WHERE d.actor_user_id = ?1 AND d.reason_code = ?2 AND d.at = ?3`,
    )
    .bind(o.userId, CLOSE_REASON, now)
    .all<{ to: string }>();
  return results.map((r) => ({ to: r.to, message: CLOSE_MESSAGE }));
};

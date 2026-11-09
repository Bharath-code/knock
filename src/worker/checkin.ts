import { PLACEHOLDER } from "./auth";
import { randomHex, sha256 } from "./doors";
import { stripLinks } from "./email";

const DAY = 86_400_000;
export const CHECKIN_AFTER = 7 * DAY;
// Never chase a Yes older than this, so a late deploy doesn't mail the whole backlog.
const CHECKIN_UNTIL = 21 * DAY;
const BATCH = 50;

export type Side = "sender" | "receiver";
export type CheckinJob = { type: "checkin"; to: string; side: Side; who: string; token: string; about: string };

// Tells two Yes answers apart: the door, and the start of what the sender wrote. Links are masked.
const about = (kind: string, postText: string | null, answersJson: string) => {
  const line = (postText ?? "").split("\n")[0]!.slice(0, 70);
  const door = kind === "profile" ? "a profile door" : line ? `"${line}"` : "a door";
  let msg = "";
  try { msg = (JSON.parse(answersJson) as { message?: string }).message ?? ""; } catch { /* malformed row: door alone */ }
  const excerpt = stripLinks(msg).slice(0, 80);
  return excerpt ? `${door}: "${excerpt}"` : door;
};

// What "it happened" means per template; anything unknown counts as a connection.
const HAPPENED: Record<string, string> = { referral: "referred", beta: "tried", gig: "connected" };
export const happenedType = (template: string) => HAPPENED[template] ?? "connected";

// Yes answers 7 to 21 days old with no check-in yet. A row per side is written even for a side with no real email,
// so the knock is not picked again; a job is queued only where the row was newly written and the email is real.
export const dueCheckins = async (db: D1Database, now: number): Promise<CheckinJob[]> => {
  const { results } = await db
    .prepare(
      `SELECT d.knock_id AS id, s.email AS sender, r.email AS receiver, COALESCE(NULLIF(r.display_name, ''), '@' || r.handle) AS who, dr.kind, dr.post_text AS post, k.answers_json AS answers
       FROM decisions d JOIN knocks k ON k.id = d.knock_id JOIN people s ON s.id = k.person_id
       JOIN doors dr ON dr.id = k.door_id JOIN users u ON u.id = dr.owner_user_id JOIN people r ON r.id = u.person_id
       WHERE d.answer = 'yes' AND d.at <= ?1 AND d.at > ?2 AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.knock_id = d.knock_id)
       LIMIT ${BATCH}`,
    )
    .bind(now - CHECKIN_AFTER, now - CHECKIN_UNTIL)
    .all<{ id: string; sender: string; receiver: string; who: string; kind: string; post: string | null; answers: string }>();
  const jobs: CheckinJob[] = [];
  for (const r of results) {
    for (const [side, to] of [["sender", r.sender], ["receiver", r.receiver]] as const) {
      const token = randomHex(16);
      const w = await db.prepare("INSERT OR IGNORE INTO checkins (knock_id, side, token_hash, sent_at) VALUES (?1, ?2, ?3, ?4)").bind(r.id, side, await sha256(token), now).run();
      if ((w.meta.changes ?? 0) === 1 && !to.endsWith(PLACEHOLDER)) jobs.push({ type: "checkin", to, side, who: r.who, token, about: about(r.kind, r.post, r.answers) });
    }
  }
  return jobs;
};

export type CheckinView = { side: Side; who: string; about: string; done: boolean };

export const checkinView = async (db: D1Database, token: string): Promise<CheckinView | null> => {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const r = await db
    .prepare(
      `SELECT c.side, COALESCE(NULLIF(p.display_name, ''), '@' || p.handle) AS who, d.kind, d.post_text AS post, k.answers_json AS answers,
              EXISTS (SELECT 1 FROM outcomes o WHERE o.knock_id = c.knock_id AND o.reported_by = c.side) AS done
       FROM checkins c JOIN knocks k ON k.id = c.knock_id JOIN doors d ON d.id = k.door_id JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id
       WHERE c.token_hash = ?1`,
    )
    .bind(await sha256(token))
    .first<{ side: Side; who: string; kind: string; post: string | null; answers: string; done: number }>();
  return r ? { side: r.side, who: r.who, about: about(r.kind, r.post, r.answers), done: r.done === 1 } : null;
};

// Stores one outcome per side. The first real outcome of a knock bumps the door and sender counters once;
// when both sides report a real outcome, both rows are marked confirmed.
export const recordOutcome = async (db: D1Database, token: string, happened: boolean, now = Date.now()): Promise<"ok" | "invalid" | "done"> => {
  if (!/^[0-9a-f]{32}$/.test(token)) return "invalid";
  const c = await db
    .prepare(
      `SELECT c.knock_id AS id, c.side, k.org_id AS org, k.door_id AS door, k.person_id AS person, dr.template
       FROM checkins c JOIN knocks k ON k.id = c.knock_id JOIN doors dr ON dr.id = k.door_id WHERE c.token_hash = ?1`,
    )
    .bind(await sha256(token))
    .first<{ id: string; side: Side; org: string; door: string; person: string; template: string }>();
  if (!c) return "invalid";
  const type = happened ? happenedType(c.template) : "none";
  const firstReal = happened && !(await db.prepare("SELECT 1 AS ok FROM outcomes WHERE knock_id = ?1 AND type <> 'none'").bind(c.id).first());
  try {
    await db.batch([
      db.prepare("INSERT INTO outcomes (id, org_id, knock_id, type, reported_by, confirmed_by_both, at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)").bind(crypto.randomUUID(), c.org, c.id, type, c.side, now),
      db.prepare("UPDATE door_stats SET outcomes_total = outcomes_total + ?2, updated_at = ?3 WHERE door_id = ?1").bind(c.door, firstReal ? 1 : 0, now),
      db.prepare("UPDATE person_stats SET outcomes_count = outcomes_count + ?2, updated_at = ?3 WHERE person_id = ?1").bind(c.person, firstReal ? 1 : 0, now),
      db.prepare("UPDATE outcomes SET confirmed_by_both = 1 WHERE knock_id = ?1 AND type <> 'none' AND (SELECT COUNT(*) FROM outcomes WHERE knock_id = ?1 AND type <> 'none') = 2").bind(c.id),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed: outcomes\./.test(e.message)) return "done";
    throw e;
  }
  return "ok";
};

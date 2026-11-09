import { PROFILE_SLUG } from "../shared/door";
import { NOTE_MAX } from "../shared/inbox";
import { emailKey } from "../shared/knock";
import { getDoor, randomHex, sha256 } from "./doors";
import { stripLinks } from "./email";
import { withinLimit } from "./gate";
import type { OwnerUser } from "./inbox";

const DAY = 86_400_000;
export const PASS_TTL = 7 * DAY;
export const PASSES_PER_HOUR = 20;

export type PassJob = { type: "pass"; to: string; by: string; toName: string; note: string | null; token: string; knockId: string; at: number };
export type OfferFail = "open" | "target" | "closed" | "same" | "knocked" | "limited";
export const PASS_REFUSAL: Record<OfferFail, string> = {
  open: "That knock is no longer open.",
  target: "Pick one of your doors or paste a link like /d/handle/slug.",
  closed: "That door is closed.",
  same: "That is the door the knock came to.",
  knocked: "The sender already knocked on that door.",
  limited: "Too many passes this hour. Try again later.",
};
export type Offer = ({ ok: true } & PassJob) | { ok: false; reason: OfferFail };

const name = (alias: string) => `COALESCE(NULLIF(${alias}.display_name, ''), '@' || ${alias}.handle)`;

const parseTarget = (raw: string): { handle: string; slug: string } | null => {
  try {
    const parts = new URL(raw.trim(), "https://doorbell.invalid").pathname.split("/").filter(Boolean);
    if (parts[0] !== "d" || !parts[1] || parts.length > 3) return null;
    return { handle: decodeURIComponent(parts[1]), slug: parts[2] ? decodeURIComponent(parts[2]) : PROFILE_SLUG };
  } catch {
    return null;
  }
};

// One of the owner's own door ids, or any /d/:handle/:slug link.
const resolve = async (db: D1Database, o: OwnerUser, target: string) => {
  const mine = await db
    .prepare("SELECT p.handle, d.slug FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id WHERE d.id = ?1 AND d.owner_user_id = ?2")
    .bind(target.trim(), o.userId)
    .first<{ handle: string; slug: string }>();
  const t = mine ?? parseTarget(target);
  return t ? getDoor(db, t.handle, t.slug) : null;
};

const pending = `k.id = ?1 AND k.status IN ('new', 'seen') AND k.expires_at > ?2 AND k.door_id IN (SELECT id FROM doors WHERE owner_user_id = ?3)`;

// Nothing is sent to the target door here: this only records the offer and emails the sender a one-tap confirm link.
export const offerPass = async (db: D1Database, o: OwnerUser, knockId: string, target: string, rawNote: string, now = Date.now()): Promise<Offer> => {
  const k = await db
    .prepare(`SELECT k.door_id AS door, k.person_id AS person, p.email FROM knocks k JOIN people p ON p.id = k.person_id WHERE ${pending}`)
    .bind(knockId, now, o.userId)
    .first<{ door: string; person: string; email: string }>();
  if (!k) return { ok: false, reason: "open" };
  const to = await resolve(db, o, target);
  if (!to) return { ok: false, reason: "target" };
  if (to.status !== "open") return { ok: false, reason: "closed" };
  if (to.id === k.door) return { ok: false, reason: "same" };
  if (await db.prepare("SELECT 1 AS ok FROM knocks WHERE door_id = ?1 AND person_id = ?2").bind(to.id, k.person).first()) return { ok: false, reason: "knocked" };
  if (!(await withinLimit(db, `pass:${o.userId}`, now, PASSES_PER_HOUR))) return { ok: false, reason: "limited" };
  const by = (await db.prepare(`SELECT ${name("p")} AS n FROM users u JOIN people p ON p.id = u.person_id WHERE u.id = ?1`).bind(o.userId).first<{ n: string }>())?.n ?? "A receiver";
  const note = stripLinks(rawNote).slice(0, NOTE_MAX) || null;
  const token = randomHex(16);
  const [first] = await db.batch([
    db
      .prepare(`INSERT INTO decisions (id, org_id, knock_id, actor_user_id, answer, reason_code, note, at) SELECT ?4, k.org_id, k.id, ?3, 'pass', NULL, ?5, ?2 FROM knocks k WHERE ${pending}`)
      .bind(knockId, now, o.userId, crypto.randomUUID(), note),
    db
      .prepare(`UPDATE door_stats SET answered_in_window = answered_in_window + 1, passes_out = passes_out + 1, updated_at = ?2 WHERE door_id IN (SELECT k.door_id FROM knocks k WHERE ${pending})`)
      .bind(knockId, now, o.userId),
    db
      .prepare(`UPDATE person_stats SET answered = answered + 1, updated_at = ?2 WHERE person_id IN (SELECT k.person_id FROM knocks k WHERE ${pending})`)
      .bind(knockId, now, o.userId),
    db
      .prepare(
        `INSERT INTO passes (id, org_id, from_knock_id, from_door_id, to_door_id, note, status, created_at, token_hash, by_name)
         SELECT ?4, k.org_id, k.id, k.door_id, ?5, ?6, 'pending', ?2, ?7, ?8 FROM knocks k WHERE ${pending}`,
      )
      .bind(knockId, now, o.userId, crypto.randomUUID(), to.id, note, await sha256(token), by),
    db
      .prepare(`INSERT INTO audit_log (id, org_id, actor, action, target, at) SELECT ?4, k.org_id, ?3, 'inbox.pass', k.id, ?2 FROM knocks k WHERE ${pending}`)
      .bind(knockId, now, o.userId, crypto.randomUUID()),
    db.prepare(`UPDATE knocks AS k SET status = 'answered', answered_at = ?2, seen_at = COALESCE(seen_at, ?2) WHERE ${pending}`).bind(knockId, now, o.userId),
  ]);
  if ((first?.meta.changes ?? 0) !== 1) return { ok: false, reason: "open" };
  const toName = (await db.prepare(`SELECT ${name("p")} AS n FROM users u JOIN people p ON p.id = u.person_id WHERE u.id = (SELECT owner_user_id FROM doors WHERE id = ?1)`).bind(to.id).first<{ n: string }>())?.n ?? "another door";
  return { ok: true, type: "pass", to: k.email, by, toName, note, token, knockId, at: now };
};

// Undo deletes the decision and the pending pass, so a pass that was taken back is not emailed.
export const stillPassed = async (db: D1Database, knockId: string, at: number) =>
  (await db
    .prepare("SELECT 1 AS ok FROM decisions d JOIN passes ps ON ps.from_knock_id = d.knock_id WHERE d.knock_id = ?1 AND d.at = ?2 AND d.answer = 'pass' AND ps.status = 'pending'")
    .bind(knockId, at)
    .first()) !== null;

export type PassView = { by: string; toName: string; door: string; note: string | null; status: string; expired: boolean; closed: boolean };

const valid = (t: string) => /^[0-9a-f]{32}$/.test(t);

export const passView = async (db: D1Database, token: string, now = Date.now()): Promise<PassView | null> => {
  if (!valid(token)) return null;
  const r = await db
    .prepare(
      `SELECT ps.status, ps.note, ps.created_at AS at, ps.by_name AS by, ${name("tp")} AS toName, tp.handle, td.status AS doorStatus, td.kind, td.post_text AS post
       FROM passes ps JOIN doors td ON td.id = ps.to_door_id JOIN users tu ON tu.id = td.owner_user_id JOIN people tp ON tp.id = tu.person_id
       WHERE ps.token_hash = ?1`,
    )
    .bind(await sha256(token))
    .first<{ status: string; note: string | null; at: number; by: string | null; toName: string; handle: string; doorStatus: string; kind: string; post: string | null }>();
  if (!r) return null;
  return {
    by: r.by ?? "A receiver", toName: r.toName, note: r.note, status: r.status,
    door: r.kind === "profile" ? `@${r.handle}'s door` : stripLinks((r.post ?? "").split("\n")[0]!).slice(0, 70) || `@${r.handle}'s door`,
    expired: now - r.at > PASS_TTL, closed: r.doorStatus !== "open",
  };
};

export type Confirm =
  | { ok: true; already: true }
  | { ok: true; already: false; token: string; id: string; to: string; who: string; days: number }
  | { ok: false; reason: "invalid" | "expired" | "closed" | "knocked" | "limited" };

type Row = {
  id: string; status: string; at: number; from: string; note: string | null; by: string | null; toDoor: string; org: string; days: number; open: string;
  fields: string; answers: string; proof: string | null; person: string; email: string; who: string;
};

// The one tap. Re-checks everything, claims the pass first so two taps cannot create two knocks, then lets the
// target's Door object run its duplicate check, rank job, alarm and live announce.
export const confirmPass = async (env: Pick<Env, "DB" | "DOOR">, token: string, ip: string, now = Date.now()): Promise<Confirm> => {
  if (!valid(token)) return { ok: false, reason: "invalid" };
  const db = env.DB;
  const r = await db
    .prepare(
      `SELECT ps.id, ps.status, ps.created_at AS at, ps.from_knock_id AS "from", ps.note, ps.by_name AS by, ps.to_door_id AS toDoor, td.org_id AS org, td.window_days AS days, td.status AS open,
              td.fields_json AS fields, k.answers_json AS answers, k.proof_url AS proof, k.person_id AS person, sp.email, ${name("tp")} AS who
       FROM passes ps JOIN knocks k ON k.id = ps.from_knock_id JOIN people sp ON sp.id = k.person_id
       JOIN doors td ON td.id = ps.to_door_id JOIN users tu ON tu.id = td.owner_user_id JOIN people tp ON tp.id = tu.person_id
       WHERE ps.token_hash = ?1`,
    )
    .bind(await sha256(token))
    .first<Row>();
  if (!r || r.status === "declined") return { ok: false, reason: "invalid" };
  if (r.status === "accepted") return { ok: true, already: true };
  if (now - r.at > PASS_TTL) return { ok: false, reason: "expired" };
  if (r.open !== "open") return { ok: false, reason: "closed" };
  if (await db.prepare("SELECT 1 AS ok FROM knocks WHERE door_id = ?1 AND person_id = ?2").bind(r.toDoor, r.person).first()) return { ok: false, reason: "knocked" };
  const claim = await db.prepare("UPDATE passes SET status = 'accepted', sender_consent_at = ?2 WHERE id = ?1 AND status = 'pending'").bind(r.id, now).run();
  if ((claim.meta.changes ?? 0) !== 1) return { ok: true, already: true };
  const release = () => db.prepare("UPDATE passes SET status = 'pending', sender_consent_at = NULL WHERE id = ?1").bind(r.id).run();
  let body: { message?: string; answers?: { a: string }[] } = {};
  try { body = JSON.parse(r.answers); } catch { /* unreadable answers: the new receiver gets the note alone */ }
  let qs: string[] = [];
  try { qs = JSON.parse(r.fields) as string[]; } catch { /* no questions */ }
  const message = `${r.note ? `Passed by ${r.by ?? "a receiver"}: ${r.note}\n\n` : ""}${body.message ?? ""}`.slice(0, 2000);
  try {
    const result = await env.DOOR.getByName(r.toDoor).knock(
      {
        orgId: r.org, doorId: r.toDoor, windowDays: r.days, email: r.email, key: emailKey(r.email), message,
        answers: qs.map((q, i) => ({ q, a: body.answers?.[i]?.a || "See the message." })), proof: r.proof ?? "", source: "pass", passedFrom: r.from,
      },
      ip,
    );
    if (!result.ok) {
      await release();
      return { ok: false, reason: result.reason === "limited" ? "limited" : "knocked" };
    }
    await db.prepare("UPDATE passes SET new_knock_id = ?2 WHERE id = ?1").bind(r.id, result.id).run();
    return { ok: true, already: false, token: result.token, id: result.id, to: r.email, who: r.who, days: r.days };
  } catch (e) {
    await release();
    throw e;
  }
};

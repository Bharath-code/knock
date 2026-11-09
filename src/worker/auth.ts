import { normalizeEmail } from "../shared/knock";
import { idHash, randomHex, sha256 } from "./doors";

export const LINK_MS = 15 * 60_000;
export const SESSION_MS = 30 * 86_400_000;
export const IDLE_MS = 7 * 86_400_000;
const TOUCH_MS = 3_600_000;

// One definition of a live session: inside the 30-day cap and active in the last 7 days.
export const SESSION_SQL = "SELECT person_id FROM sessions WHERE token_hash = ?1 AND created_at > ?2 AND COALESCE(last_seen_at, created_at) > ?3";
export const sessionBinds = (hash: string, now: number) => [hash, now - SESSION_MS, now - IDLE_MS] as const;

// Rolling idle timeout: refresh last_seen_at at most once an hour per session.
export const touchSession = (db: D1Database, hash: string, now = Date.now()) =>
  db
    .prepare("UPDATE sessions SET last_seen_at = ?2 WHERE token_hash = ?1 AND COALESCE(last_seen_at, created_at) < ?3")
    .bind(hash, now, now - TOUCH_MS)
    .run();

export const deviceLabel = (ua: string | undefined) => {
  const u = ua ?? "";
  const browser = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(u) ? "iOS" : /Android/.test(u) ? "Android" : /Mac OS X/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "unknown device";
  return `${browser} on ${os}`;
};
export const PLACEHOLDER = "@anon.doorbell.invalid";

// A link is for sign-in (personId null) or for attaching an email to an anonymous owner.
// The target person is fixed here, when the link is requested, never at confirm time.
export const requestLink = async (db: D1Database, email: string, personId: string | null, now = Date.now()) => {
  const token = randomHex(32);
  const e = normalizeEmail(email);
  await db
    .prepare("INSERT INTO magic_links (token_hash, email, email_hash, person_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(await sha256(token), e, await idHash(e), personId, now + LINK_MS, now)
    .run();
  return token;
};

type Link = { email: string; email_hash: string; person_id: string | null };
export type Confirmed = { ok: true; token: string; alert: string | null } | { ok: false; error: string };

const attach = async (db: D1Database, link: Link & { person_id: string }): Promise<string | null> => {
  const p = await db.prepare("SELECT email FROM people WHERE id = ?1").bind(link.person_id).first<{ email: string }>();
  if (!p) return "That account no longer exists.";
  if (!p.email.endsWith(PLACEHOLDER)) return normalizeEmail(p.email) === link.email ? null : "This account already has an email.";
  const other = await db
    .prepare("SELECT p.id, EXISTS (SELECT 1 FROM users u WHERE u.person_id = p.id) AS has_user FROM people p WHERE p.email = ?1")
    .bind(link.email)
    .first<{ id: string; has_user: number }>();
  if (other && other.id !== link.person_id) {
    if (other.has_user) return "That email already has an account. Sign in with it instead.";
    try {
      await mergeSender(db, other.id, link.person_id, link.email, link.email_hash);
    } catch {
      return "That email is already in use.";
    }
    return null;
  }
  try {
    await db.prepare("UPDATE people SET email = ?1, email_hash = ?2 WHERE id = ?3").bind(link.email, link.email_hash, link.person_id).run();
  } catch {
    return "That email is already in use.";
  }
  return null;
};

// The confirmed link proves the owner holds this address, so the sender record that knocked from it becomes theirs.
// Order matters: knocks cascade on delete, so everything moves to the owner before the sender row goes.
const mergeSender = async (db: D1Database, from: string, to: string, email: string, emailHash: string) => {
  await db.batch([
    db.prepare("UPDATE knocks SET person_id = ?2 WHERE person_id = ?1").bind(from, to),
    db.prepare("UPDATE person_stats SET person_id = ?2 WHERE person_id = ?1 AND NOT EXISTS (SELECT 1 FROM person_stats WHERE person_id = ?2)").bind(from, to),
    db.prepare("UPDATE feedback SET person_id = ?2 WHERE person_id = ?1").bind(from, to),
    db
      .prepare(
        `UPDATE doors SET from_sender = 1 WHERE owner_user_id IN (SELECT id FROM users WHERE person_id = ?2)
         AND created_at > (SELECT MIN(created_at) FROM knocks WHERE person_id = ?2)`,
      )
      .bind(from, to),
    db.prepare("DELETE FROM people WHERE id = ?1").bind(from),
    db.prepare("UPDATE people SET email = ?1, email_hash = ?2 WHERE id = ?3").bind(email, emailHash, to),
  ]);
};

// A person is the exact normalized address; the confirmed link proves its owner holds it. a and a+x are different
// people, since on many providers they are different mailboxes. emailKey (which drops "+tag") is only for abuse limits.
const personFor = async (db: D1Database, link: Link, now: number): Promise<string | null> => {
  await db
    .prepare("INSERT OR IGNORE INTO people (id, email, email_hash, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(crypto.randomUUID(), link.email, link.email_hash, now)
    .run();
  const p = await db.prepare("SELECT id FROM people WHERE email = ?1").bind(link.email).first<{ id: string }>();
  return p?.id ?? null;
};

// Every user gets an org on first sign-in. Senders already have a people row but no user yet.
const ensureUser = async (db: D1Database, personId: string, email: string, now: number) => {
  const has = () => db.prepare("SELECT 1 AS ok FROM users WHERE person_id = ?1").bind(personId).first();
  if (await has()) return;
  const org = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO orgs (id, name, created_at) VALUES (?1, ?2, ?3)").bind(org, email, now),
      db.prepare("INSERT INTO users (id, org_id, person_id, role, created_at) VALUES (?1, ?2, ?3, 'owner', ?4)").bind(crypto.randomUUID(), org, personId, now),
    ]);
  } catch {
    if (!(await has())) throw new Error("could not create user");
  }
};

// One statement consumes the link, so two confirms can never both win. Always mints a fresh session.
export const confirmLink = async (db: D1Database, token: string, now = Date.now(), device: string | null = null): Promise<Confirmed> => {
  const link = await db
    .prepare("UPDATE magic_links SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 RETURNING email, email_hash, person_id")
    .bind(await sha256(token), now)
    .first<Link>();
  if (!link) return { ok: false, error: "This link has expired or was already used. Ask for a new one." };
  let personId: string;
  if (link.person_id) {
    const err = await attach(db, link as Link & { person_id: string });
    if (err) return { ok: false, error: err };
    personId = link.person_id;
  } else {
    const found = await personFor(db, link, now);
    if (!found) return { ok: false, error: "This address can't sign in. Use the address you first used on Doorbell." };
    personId = found;
    await ensureUser(db, personId, link.email, now);
  }
  // A sign-in while another device is signed in sends the account an alert.
  const others = await db
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE person_id = ?1 AND created_at > ?2 AND COALESCE(last_seen_at, created_at) > ?3")
    .bind(personId, now - SESSION_MS, now - IDLE_MS)
    .first<{ n: number }>();
  const session = randomHex(32);
  await db.batch([
    db.prepare("INSERT INTO sessions (token_hash, person_id, created_at, last_seen_at, device) VALUES (?1, ?2, ?3, ?3, ?4)").bind(await sha256(session), personId, now, device),
    db
      .prepare("INSERT INTO audit_log (id, org_id, actor, action, target, at) SELECT ?1, org_id, ?2, 'auth.sign_in', ?3, ?4 FROM users WHERE person_id = ?2")
      .bind(crypto.randomUUID(), personId, device, now),
  ]);
  return { ok: true, token: session, alert: others?.n && !link.person_id ? link.email : null };
};

export type SignedOut = "session" | "legacy" | "anonymous" | "none";

// A session is deleted. A legacy owner cookie is one shared credential, not a per-device session, so
// signing out with it retires the credential itself; without a real email that would lock the owner out.
export const signOut = async (db: D1Database, token: string, now = Date.now()): Promise<SignedOut> => {
  const hash = await sha256(token);
  if ((await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(hash).run()).meta.changes === 1) return "session";
  const p = await db
    .prepare("SELECT p.id, p.email, u.org_id FROM people p JOIN users u ON u.person_id = p.id WHERE p.owner_token_hash = ?1")
    .bind(hash)
    .first<{ id: string; email: string; org_id: string }>();
  if (!p) return "none";
  if (p.email.endsWith(PLACEHOLDER)) return "anonymous";
  await db.batch([
    db.prepare("UPDATE people SET owner_token_hash = NULL WHERE id = ?1 AND owner_token_hash = ?2").bind(p.id, hash),
    db.prepare("INSERT INTO audit_log (id, org_id, actor, action, target, at) VALUES (?1, ?2, ?3, 'auth.sign_out_legacy', NULL, ?4)").bind(crypto.randomUUID(), p.org_id, p.id, now),
  ]);
  return "legacy";
};

// Needs a real email, since it also retires the legacy owner cookie and the email is the way back in.
export const signOutEverywhere = async (db: D1Database, userId: string, orgId: string, now = Date.now()) => {
  const p = await personOfUser(db, userId);
  if (!p || p.email.endsWith(PLACEHOLDER)) return false;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE person_id = ?1").bind(p.id),
    db.prepare("UPDATE people SET owner_token_hash = NULL WHERE id = ?1").bind(p.id),
    db.prepare("INSERT INTO audit_log (id, org_id, actor, action, target, at) VALUES (?1, ?2, ?3, 'auth.sign_out_all', NULL, ?4)").bind(crypto.randomUUID(), orgId, p.id, now),
  ]);
  return true;
};

export const pruneAuth = (db: D1Database, now = Date.now()) =>
  db.batch([
    db.prepare("DELETE FROM magic_links WHERE expires_at < ?1").bind(now - 86_400_000),
    db.prepare("DELETE FROM sessions WHERE created_at < ?1 OR COALESCE(last_seen_at, created_at) < ?2").bind(now - SESSION_MS, now - IDLE_MS),
  ]);

export const personOfUser = async (db: D1Database, userId: string) =>
  db
    .prepare("SELECT p.id, p.email, p.handle FROM users u JOIN people p ON p.id = u.person_id WHERE u.id = ?1")
    .bind(userId)
    .first<{ id: string; email: string; handle: string | null }>();

// Read-only: lets the confirm page say which account the link signs into, without using the link up.
export const peekLink = async (db: D1Database, token: string, now = Date.now()) =>
  db
    .prepare(
      `SELECT l.email, p.handle, l.person_id IS NOT NULL AS claim FROM magic_links l LEFT JOIN people p ON p.id = l.person_id
       WHERE l.token_hash = ?1 AND l.used_at IS NULL AND l.expires_at > ?2`,
    )
    .bind(await sha256(token), now)
    .first<{ email: string; handle: string | null; claim: number }>();

import { emailKey, normalizeEmail } from "../shared/knock";
import { randomHex, sha256 } from "./doors";

export const LINK_MS = 15 * 60_000;
export const SESSION_MS = 30 * 86_400_000;
export const PLACEHOLDER = "@anon.doorbell.invalid";

// A link is for sign-in (personId null) or for attaching an email to an anonymous owner.
// The target person is fixed here, when the link is requested, never at confirm time.
export const requestLink = async (db: D1Database, email: string, personId: string | null, now = Date.now()) => {
  const token = randomHex(32);
  const e = normalizeEmail(email);
  await db
    .prepare("INSERT INTO magic_links (token_hash, email, email_hash, person_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(await sha256(token), e, await sha256(emailKey(e)), personId, now + LINK_MS, now)
    .run();
  return token;
};

type Link = { email: string; email_hash: string; person_id: string | null };
export type Confirmed = { ok: true; token: string } | { ok: false; error: string };

const attach = async (db: D1Database, link: Link & { person_id: string }): Promise<string | null> => {
  const p = await db.prepare("SELECT email, email_hash FROM people WHERE id = ?1").bind(link.person_id).first<{ email: string; email_hash: string }>();
  if (!p) return "That account no longer exists.";
  if (!p.email.endsWith(PLACEHOLDER)) return p.email_hash === link.email_hash ? null : "This account already has an email.";
  const other = await db
    .prepare("SELECT p.id, EXISTS (SELECT 1 FROM users u WHERE u.person_id = p.id) AS has_user FROM people p WHERE p.email_hash = ?1")
    .bind(link.email_hash)
    .first<{ id: string; has_user: number }>();
  if (other && other.id !== link.person_id) {
    return other.has_user ? "That email already has an account. Sign in with it instead." : "That email has knocked on a door before and can't be attached yet. Use a different email.";
  }
  try {
    await db.prepare("UPDATE people SET email = ?1, email_hash = ?2 WHERE id = ?3").bind(link.email, link.email_hash, link.person_id).run();
  } catch {
    return "That email is already in use.";
  }
  return null;
};

const personFor = async (db: D1Database, link: Link, now: number) => {
  await db
    .prepare("INSERT OR IGNORE INTO people (id, email, email_hash, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(crypto.randomUUID(), link.email, link.email_hash, now)
    .run();
  return (await db.prepare("SELECT id FROM people WHERE email_hash = ?1").bind(link.email_hash).first<{ id: string }>())!.id;
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
export const confirmLink = async (db: D1Database, token: string, now = Date.now()): Promise<Confirmed> => {
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
    personId = await personFor(db, link, now);
    await ensureUser(db, personId, link.email, now);
  }
  const session = randomHex(32);
  await db.prepare("INSERT INTO sessions (token_hash, person_id, created_at) VALUES (?1, ?2, ?3)").bind(await sha256(session), personId, now).run();
  return { ok: true, token: session };
};

export const pruneAuth = (db: D1Database, now = Date.now()) =>
  db.batch([
    db.prepare("DELETE FROM magic_links WHERE expires_at < ?1").bind(now - 86_400_000),
    db.prepare("DELETE FROM sessions WHERE created_at < ?1").bind(now - SESSION_MS),
  ]);

export const personOfUser = async (db: D1Database, userId: string) =>
  db
    .prepare("SELECT p.id, p.email, p.handle FROM users u JOIN people p ON p.id = u.person_id WHERE u.id = ?1")
    .bind(userId)
    .first<{ id: string; email: string; handle: string | null }>();

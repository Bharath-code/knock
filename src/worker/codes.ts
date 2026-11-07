import type { Pool, YesCode } from "../shared/codes";
import { randomHex } from "./doors";
import type { OwnerUser } from "./inbox";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// CODES_KEY: base64 of 32 random bytes. Rotating it strands every unassigned code.
const aes = (key: string) => crypto.subtle.importKey("raw", unb64(key), "AES-GCM", false, ["encrypt", "decrypt"]);
const mac = (key: string) => crypto.subtle.importKey("raw", unb64(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

export const encryptCode = async (key: string, code: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(key), new TextEncoder().encode(code)));
  return b64(Uint8Array.from([...iv, ...ct]));
};

export const decryptCode = async (key: string, enc: string) => {
  const raw = unb64(enc);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aes(key), raw.slice(12)));
};

// Keyed, so a short code cannot be brute-forced back out of the dedupe hash.
const codeHash = async (key: string, doorId: string, code: string) => hex(await crypto.subtle.sign("HMAC", await mac(key), new TextEncoder().encode(`${doorId}:${code}`)));

export const addCodes = async (db: D1Database, key: string, doorId: string, orgId: string, codes: string[]) => {
  const stmts: D1PreparedStatement[] = [];
  for (const c of codes) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO codes (id, org_id, door_id, code_enc, code_hash) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(randomHex(16), orgId, doorId, await encryptCode(key, c), await codeHash(key, doorId, c)),
    );
  }
  let added = 0;
  for (let i = 0; i < stmts.length; i += 100) for (const r of await db.batch(stmts.slice(i, i + 100))) added += r.meta.changes;
  return { added, skipped: codes.length - added };
};

// Counts only. Codes themselves never leave the database except in the assigned sender's email.
export const pools = async (db: D1Database, o: OwnerUser): Promise<Pool[]> =>
  (
    await db
      .prepare(
        `SELECT d.id AS doorId, d.slug, COALESCE(SUM(c.id IS NOT NULL AND c.assigned_at IS NULL), 0) AS free, COUNT(c.id) AS total
         FROM doors d LEFT JOIN codes c ON c.door_id = d.id
         WHERE d.owner_user_id = ?1 AND d.status = 'open' GROUP BY d.id ORDER BY d.created_at`,
      )
      .bind(o.userId)
      .all<Pool>()
  ).results;

export const yesCode = async (db: D1Database, knockId: string): Promise<YesCode> => {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(knock_id = ?1), 0) AS mine FROM codes WHERE door_id = (SELECT door_id FROM knocks WHERE id = ?1)`,
    )
    .bind(knockId)
    .first<{ total: number; mine: number }>();
  return !r?.total ? "none" : r.mine ? "assigned" : "empty";
};

export const codeFor = async (db: D1Database, key: string | undefined, knockId: string): Promise<string | null> => {
  if (!key) return null;
  const r = await db.prepare("SELECT code_enc AS enc FROM codes WHERE knock_id = ?1").bind(knockId).first<{ enc: string }>();
  return r ? decryptCode(key, r.enc) : null;
};

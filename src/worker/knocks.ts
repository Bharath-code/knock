import { normalizeEmail } from "../shared/knock";
import { idHash, randomHex, sha256 } from "./doors";

export type KnockWrite = {
  orgId: string;
  doorId: string;
  windowDays: number;
  email: string;
  key: string;
  message: string;
  answers: { q: string; a: string }[];
  proof: string;
  source: string;
  passedFrom?: string;
};

const DAY_MS = 86_400_000;

// Returns the raw status token; only its hash is stored. One D1 batch, so a knock is all-or-nothing.
export const writeKnock = async (db: D1Database, k: KnockWrite, now = Date.now()) => {
  const token = randomHex(16);
  const id = crypto.randomUUID();
  // A person is the exact address; k.key (+tag stripped) only feeds the per-door duplicate check in the Door object.
  const email = normalizeEmail(k.email);
  const emailHash = await idHash(email);
  const person = "(SELECT id FROM people WHERE email = ?)";
  await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO people (id, email, email_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), email, emailHash, now),
    db
      .prepare(
        `INSERT INTO knocks (id, org_id, door_id, person_id, answers_json, proof_url, consent_at, source, passed_from_knock_id, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ${person}, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, k.orgId, k.doorId, email,
        JSON.stringify({ message: k.message, answers: k.answers }), k.proof || null, now, k.source, k.passedFrom ?? null,
        await sha256(token), now, now + k.windowDays * DAY_MS,
      ),
    db
      .prepare(
        "INSERT INTO door_stats (door_id, org_id, knocks_total, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (door_id) DO UPDATE SET knocks_total = knocks_total + 1, updated_at = excluded.updated_at",
      )
      .bind(k.doorId, k.orgId, now),
    db
      .prepare(
        `INSERT INTO person_stats (person_id, knocks_sent, distinct_receivers, updated_at) VALUES (${person}, 1, 1, ?)
         ON CONFLICT (person_id) DO UPDATE SET knocks_sent = knocks_sent + 1, distinct_receivers = distinct_receivers + 1, updated_at = excluded.updated_at`,
      )
      .bind(email, now),
  ]);
  return { token, id };
};

export type Status = {
  who: string;
  title: string;
  createdAt: number;
  id: string;
  seenAt: number | null;
  answeredAt: number | null;
  answer: string | null;
  expiresAt: number;
};

export const getStatus = async (db: D1Database, token: string): Promise<Status | null> => {
  const r = await db
    .prepare(
      `SELECT k.id, p.handle, p.display_name, d.kind, d.post_text, k.created_at, k.seen_at, k.answered_at, k.expires_at,
              (SELECT answer FROM decisions WHERE knock_id = k.id ORDER BY at DESC LIMIT 1) AS answer
       FROM knocks k JOIN doors d ON d.id = k.door_id JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id
       WHERE k.token_hash = ?`,
    )
    .bind(await sha256(token))
    .first<{
      handle: string; display_name: string | null; kind: string; post_text: string | null;
      id: string; created_at: number; seen_at: number | null; answered_at: number | null; expires_at: number; answer: string | null;
    }>();
  return r
    ? {
        who: r.display_name || `@${r.handle}`,
        title: r.kind === "profile" ? `@${r.handle}'s door` : (r.post_text ?? "").split("\n")[0]!.slice(0, 70),
        id: r.id, createdAt: r.created_at, seenAt: r.seen_at, answeredAt: r.answered_at, answer: r.answer, expiresAt: r.expires_at,
      }
    : null;
};

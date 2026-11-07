import { PROFILE_SLUG, profileFields, slugify, type CreateDoor } from "../shared/door";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer as ArrayBuffer);
const newToken = () => randomHex(24);

export type Owner = { handle: string; name: string };

// ponytail: a cookie token is the only owner proof until magic-link sign-in (ACC-1) replaces it
export const ownerFromToken = async (db: D1Database, token: string | undefined): Promise<Owner | null> => {
  if (!token) return null;
  const row = await db
    .prepare("SELECT handle, display_name FROM people WHERE owner_token_hash = ?1")
    .bind(await sha256(token))
    .first<{ handle: string; display_name: string | null }>();
  return row ? { handle: row.handle, name: row.display_name ?? "" } : null;
};

export type Made = { ok: true; slug: string; handle: string; token?: string } | { ok: false; error: string };

export const createDoor = async (db: D1Database, input: CreateDoor, token: string | undefined): Promise<Made> => {
  const now = Date.now();
  const existing = await db
    .prepare(
      "SELECT p.id AS person_id, p.owner_token_hash AS hash, u.id AS user_id, u.org_id FROM people p JOIN users u ON u.person_id = p.id WHERE p.handle = ?1",
    )
    .bind(input.handle)
    .first<{ person_id: string; hash: string | null; user_id: string; org_id: string }>();

  if (existing && (!token || existing.hash !== (await sha256(token)))) {
    return { ok: false, error: "That handle is taken. Pick another." };
  }

  const ids = existing ?? { person_id: crypto.randomUUID(), user_id: crypto.randomUUID(), org_id: crypto.randomUUID() };
  const stmts: D1PreparedStatement[] = [];
  const fresh = existing ? undefined : newToken();
  const door = (slug: string, kind: string, template: string, post: string, fields: string[], window: number) =>
    db
      .prepare(
        "INSERT INTO doors (id, org_id, owner_user_id, slug, kind, template, post_text, fields_json, window_days, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
      )
      .bind(crypto.randomUUID(), ids.org_id, ids.user_id, slug, kind, template, post || null, JSON.stringify(fields), window, now);

  if (!existing) {
    stmts.push(
      db.prepare("INSERT INTO orgs (id, name, created_at) VALUES (?1, ?2, ?3)").bind(ids.org_id, input.handle, now),
      db
        .prepare(
          "INSERT INTO people (id, email, email_hash, display_name, handle, owner_token_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        )
        .bind(
          ids.person_id,
          `${ids.person_id}@anon.doorbell.invalid`,
          await sha256(ids.person_id),
          input.name || null,
          input.handle,
          await sha256(fresh!),
          now,
        ),
      db
        .prepare("INSERT INTO users (id, org_id, person_id, role, created_at) VALUES (?1, ?2, ?3, 'owner', ?4)")
        .bind(ids.user_id, ids.org_id, ids.person_id, now),
      door(PROFILE_SLUG, "profile", "profile", "", profileFields, 7),
    );
  }

  let slug = PROFILE_SLUG;
  if (input.post) {
    const base = slugify(input.post);
    const taken = new Set(
      (
        await db
          .prepare("SELECT slug FROM doors WHERE owner_user_id = ?1 AND slug LIKE ?2")
          .bind(ids.user_id, `${base}%`)
          .all<{ slug: string }>()
      ).results.map((r) => r.slug),
    );
    slug = base;
    for (let n = 2; taken.has(slug) || slug === PROFILE_SLUG; n++) slug = `${base}-${n}`;
    stmts.push(door(slug, "post", input.template, input.post, input.fields, input.window));
  }

  try {
    await db.batch(stmts);
  } catch {
    return { ok: false, error: "That handle was just taken, or two doors collided. Try again." };
  }
  return { ok: true, slug, handle: input.handle, token: fresh };
};

export type DoorView = {
  id: string;
  orgId: string;
  handle: string;
  name: string;
  slug: string;
  kind: string;
  template: string;
  post: string;
  fields: string[];
  windowDays: number;
  status: string;
  knocks: number;
  answered: number;
};

export const getDoor = async (db: D1Database, handle: string, slug: string): Promise<DoorView | null> => {
  const r = await db
    .prepare(
      `SELECT d.id, d.org_id, p.handle, p.display_name, d.slug, d.kind, d.template, d.post_text, d.fields_json, d.window_days, d.status,
              COALESCE(s.knocks_total, 0) AS knocks, COALESCE(s.answered_in_window, 0) AS answered
       FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id
       LEFT JOIN door_stats s ON s.door_id = d.id
       WHERE p.handle = ?1 AND d.slug = ?2`,
    )
    .bind(handle, slug)
    .first<{
      id: string;
      org_id: string;
      handle: string;
      display_name: string | null;
      slug: string;
      kind: string;
      template: string;
      post_text: string | null;
      fields_json: string;
      window_days: number;
      status: string;
      knocks: number;
      answered: number;
    }>();
  return r
    ? {
        id: r.id,
        orgId: r.org_id,
        handle: r.handle,
        name: r.display_name ?? "",
        slug: r.slug,
        kind: r.kind,
        template: r.template,
        post: r.post_text ?? "",
        fields: JSON.parse(r.fields_json) as string[],
        windowDays: r.window_days,
        status: r.status,
        knocks: r.knocks,
        answered: r.answered,
      }
    : null;
};

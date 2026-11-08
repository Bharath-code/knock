import { expect, test } from "bun:test";
import { emailKey } from "../shared/knock";
import { confirmLink, LINK_MS, peekLink, requestLink, SESSION_MS } from "./auth";
import { createDoor, ownerFromToken, sha256 } from "./doors";
import { ownerUser } from "./inbox";
import { fakeDb } from "./testdb";

const input = (handle: string, post = "") => ({ handle, name: "Newbie", post, template: "referral" as const, fields: ["-"], window: 7 as const });

const signIn = async (db: D1Database, email: string, now = Date.now()) => {
  const r = await confirmLink(db, await requestLink(db, email, null, now), now);
  if (!r.ok) throw new Error(r.error);
  return r.token;
};

test("a link signs in once, creates the org and user on first sign-in, and is stored only as a hash", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  const token = await requestLink(db, "New@Example.com", null, now);
  expect(JSON.stringify(sqlite.query("SELECT * FROM magic_links").all())).not.toContain(token);
  const done = await confirmLink(db, token, now + 1_000);
  expect(done.ok).toBe(true);
  expect(sqlite.query("SELECT COUNT(*) n FROM users").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT COUNT(*) n FROM orgs").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT email FROM people").get()).toEqual({ email: "new@example.com" });
  const again = await confirmLink(db, token, now + 2_000);
  expect(again).toEqual({ ok: false, error: "This link has expired or was already used. Ask for a new one." });
  expect(sqlite.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 1 });
  expect((await ownerUser(db, done.ok ? done.token : "", now + 3_000))?.userId).toBeTruthy();
});

test("links expire after 15 minutes, and unknown tokens fail", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  const token = await requestLink(db, "a@x.com", null, now);
  expect((await confirmLink(db, token, now + LINK_MS)).ok).toBe(false);
  expect((await confirmLink(db, "nope")).ok).toBe(false);
  expect(sqlite.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 });
});

test("signing in on a second device does not log out the first, and old cookies still work", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  const a = await signIn(db, "a@x.com", now);
  const b = await signIn(db, "a@x.com", now + 1_000);
  expect(a).not.toBe(b);
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 1 });
  const [oa, ob] = [await ownerUser(db, a, now + 2_000), await ownerUser(db, b, now + 2_000)];
  expect(oa?.userId).toBe(ob?.userId);
  sqlite.run(`UPDATE people SET owner_token_hash = '${await sha256("legacy-token")}'`);
  expect((await ownerUser(db, "legacy-token", now))?.userId).toBe(oa?.userId);
  expect((await ownerUser(db, a, now + 2_000))?.userId).toBe(oa?.userId);
  expect(await ownerUser(db, a, now + SESSION_MS + 5_000)).toBeNull();
  expect(await ownerUser(db, "random", now)).toBeNull();
});

test("a sender who already knocked signs in as the same person with their own address, and no alias can take it over", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run(`INSERT INTO people (id, email, email_hash, created_at) VALUES ('s', 'a+knock@x.com', '${await sha256(emailKey("a@x.com"))}', 1)`);
  await signIn(db, "A+Knock@x.com");
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT person_id FROM users").get()).toEqual({ person_id: "s" });
  for (const alias of ["a@x.com", "a+other@x.com"]) {
    const r = await confirmLink(db, await requestLink(db, alias, null), Date.now());
    expect(r.ok).toBe(false);
  }
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT COUNT(*) n FROM users").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 1 });
});

test("peeking at a link says whose account it is without using it up", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run("INSERT INTO people (id, email, email_hash, handle, created_at) VALUES ('anon', 'anon@anon.doorbell.invalid', 'h', 'akash', 1)");
  const now = Date.now();
  const signin = await requestLink(db, "A@x.com", null, now);
  const claim = await requestLink(db, "b@x.com", "anon", now);
  expect(await peekLink(db, signin, now)).toEqual({ email: "a@x.com", handle: null, claim: 0 });
  expect(await peekLink(db, claim, now)).toEqual({ email: "b@x.com", handle: "akash", claim: 1 });
  expect(await peekLink(db, signin, now)).not.toBeNull();
  expect(await peekLink(db, "nope", now)).toBeNull();
  expect(await peekLink(db, signin, now + LINK_MS)).toBeNull();
  await confirmLink(db, signin, now);
  expect(await peekLink(db, signin, now)).toBeNull();
});

test("attaching an email to an anonymous owner follows the person fixed at request time", async () => {
  const { db, sqlite } = await fakeDb();
  const placeholder = (id: string) => `INSERT INTO people (id, email, email_hash, handle, created_at) VALUES ('${id}', '${id}@anon.doorbell.invalid', 'h-${id}', '${id}', 1)`;
  sqlite.run(placeholder("anon"));
  sqlite.run(placeholder("anon2"));
  sqlite.run("INSERT INTO orgs VALUES ('o','o','free',1); INSERT INTO users VALUES ('u','o','anon','owner',1), ('u2','o','anon2','owner',1)");
  const claim = async (person: string, email: string) => confirmLink(db, await requestLink(db, email, person), Date.now() + 1);

  const ok = await claim("anon", "me@x.com");
  expect(ok.ok).toBe(true);
  expect(sqlite.query("SELECT email, email_hash FROM people WHERE id = 'anon'").get()).toEqual({ email: "me@x.com", email_hash: await sha256(emailKey("me@x.com")) });
  const later = await signIn(db, "ME@x.com");
  expect((await ownerFromToken(db, later))?.handle).toBe("anon");
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 2 });

  expect(await claim("anon", "other@x.com")).toEqual({ ok: false, error: "This account already has an email." });
  expect(await claim("anon2", "me@x.com")).toEqual({ ok: false, error: "That email already has an account. Sign in with it instead." });
  sqlite.run(`INSERT INTO people (id, email, email_hash, created_at) VALUES ('snd', 'k@x.com', '${await sha256(emailKey("k@x.com"))}', 1)`);
  const refused = await claim("anon2", "k@x.com");
  expect(refused.ok).toBe(false);
  expect(sqlite.query("SELECT email FROM people WHERE id = 'anon2'").get()).toEqual({ email: "anon2@anon.doorbell.invalid" });
});

test("creating a door while signed in claims the handle, and a taken handle is refused", async () => {
  const { db, sqlite } = await fakeDb();
  const a = await signIn(db, "a@x.com");
  const b = await signIn(db, "b@x.com");
  expect(await createDoor(db, input("newbie"), a)).toEqual({ ok: true, slug: "profile", handle: "newbie", token: undefined });
  expect(sqlite.query("SELECT handle, display_name FROM people WHERE email = 'a@x.com'").get()).toEqual({ handle: "newbie", display_name: "Newbie" });
  expect(sqlite.query("SELECT slug, kind FROM doors").all()).toEqual([{ slug: "profile", kind: "profile" }]);

  const second = await createDoor(db, input("newbie", "Hiring a Go engineer in Pune"), a);
  expect(second.ok && second.slug).toBe("hiring-a-go-engineer-in-pune");
  expect(sqlite.query("SELECT COUNT(*) n FROM doors").get()).toEqual({ n: 2 });

  expect(await createDoor(db, input("newbie"), b)).toEqual({ ok: false, error: "That handle is taken. Pick another." });
  expect(sqlite.query("SELECT handle FROM people WHERE email = 'b@x.com'").get()).toEqual({ handle: null });
  expect(await createDoor(db, input("newbie"), undefined)).toEqual({ ok: false, error: "That handle is taken. Pick another." });
  expect(await createDoor(db, input("newbie"), "random")).toEqual({ ok: false, error: "That handle is taken. Pick another." });
});

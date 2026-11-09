import { expect, test } from "bun:test";
import { d1Metrics } from "./metrics";
import { emailKey } from "../shared/knock";
import { confirmLink, deviceLabel, IDLE_MS, LINK_MS, peekLink, requestLink, SESSION_MS, signOut, signOutEverywhere } from "./auth";
import { createDoor, idHash, ownerFromToken, sha256 } from "./doors";
import { writeKnock } from "./knocks";
import { ownerUser } from "./inbox";
import { fakeDb } from "./testdb";
import { deleteByToken } from "./retention";

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

test("a sender who already knocked signs in as the same person with their exact address; an alias is a different person", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run(`INSERT INTO people (id, email, email_hash, created_at) VALUES ('s', 'a+knock@x.com', '${await sha256(emailKey("a@x.com"))}', 1)`);
  await signIn(db, "A+Knock@x.com");
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT person_id FROM users").get()).toEqual({ person_id: "s" });
  for (const alias of ["a@x.com", "a+other@x.com"]) {
    const r = await confirmLink(db, await requestLink(db, alias, null), Date.now());
    expect(r.ok).toBe(true);
  }
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 3 });
  expect(sqlite.query("SELECT person_id FROM users WHERE person_id = 's'").get()).toEqual({ person_id: "s" });
});

test("knocking as one alias never blocks signing in as another, in both directions", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run("INSERT INTO orgs VALUES ('o','o','free',1); INSERT INTO people (id,email,email_hash,handle,created_at) VALUES ('r','r@x.com','hr','rcv',1); INSERT INTO users VALUES ('ur','o','r','owner',1)");
  sqlite.run("INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','ur','profile','profile','profile','[]',1)");
  const knock = (email: string) => writeKnock(db, { orgId: "o", doorId: "d", windowDays: 7, email, key: emailKey(email), message: "hi", answers: [], proof: "", source: "bio" });

  await knock("you+a@x.com");
  expect((await confirmLink(db, await requestLink(db, "you@x.com", null), Date.now())).ok).toBe(true);
  await knock("them@x.com");
  expect((await confirmLink(db, await requestLink(db, "them+b@x.com", null), Date.now())).ok).toBe(true);
  expect(sqlite.query("SELECT COUNT(*) n FROM knocks").get()).toEqual({ n: 2 });
  expect(sqlite.query("SELECT email FROM people WHERE id IN (SELECT person_id FROM knocks) ORDER BY email").all()).toEqual([{ email: "them@x.com" }, { email: "you+a@x.com" }]);
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
  expect(sqlite.query("SELECT email, email_hash FROM people WHERE id = 'anon'").get()).toEqual({ email: "me@x.com", email_hash: await idHash("me@x.com") });
  const later = await signIn(db, "ME@x.com");
  expect((await ownerFromToken(db, later))?.handle).toBe("anon");
  expect(sqlite.query("SELECT COUNT(*) n FROM people").get()).toEqual({ n: 2 });

  expect(await claim("anon", "other@x.com")).toEqual({ ok: false, error: "This account already has an email." });
  expect(await claim("anon2", "me@x.com")).toEqual({ ok: false, error: "That email already has an account. Sign in with it instead." });
  sqlite.run(`INSERT INTO people (id, email, email_hash, created_at) VALUES ('snd', 'k+jobs@x.com', '${await sha256(emailKey("k@x.com"))}', 1)`);
  const alias = await claim("anon2", "k@x.com");
  expect(alias.ok).toBe(true);
  expect(sqlite.query("SELECT email FROM people WHERE id = 'anon2'").get()).toEqual({ email: "k@x.com" });
  expect(sqlite.query("SELECT email FROM people WHERE id = 'snd'").get()).toEqual({ email: "k+jobs@x.com" });
});

test("claiming the exact address a sender knocked from merges their knocks; an alias does not", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run("PRAGMA foreign_keys = ON");
  const h = await sha256(emailKey("k@x.com"));
  sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id, email, email_hash, handle, created_at) VALUES ('anon','anon@anon.doorbell.invalid','h-anon','anon',1), ('rcv','r@x.com','h-r','rcv',1);
    INSERT INTO users VALUES ('u','o','anon','owner',1), ('ur','o','rcv','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','ur','profile','profile','profile','[]',1), ('mine','o','u','profile','profile','profile','[]',50);
    INSERT INTO people (id, email, email_hash, created_at) VALUES ('snd','k@x.com','${h}',1);
    INSERT INTO person_stats (person_id, knocks_sent, updated_at) VALUES ('snd', 1, 1);
    INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('k1','o','d','snd','{}','t1',1,'bio',10,99);`);

  const ok = await confirmLink(db, await requestLink(db, "k@x.com", "anon"), Date.now());
  expect(ok.ok).toBe(true);
  expect(sqlite.query("SELECT person_id FROM knocks WHERE id = 'k1'").get()).toEqual({ person_id: "anon" });
  expect(sqlite.query("SELECT person_id, knocks_sent FROM person_stats").all()).toEqual([{ person_id: "anon", knocks_sent: 1 }]);
  expect(sqlite.query("SELECT id FROM people WHERE id = 'snd'").get()).toBeNull();
  expect(sqlite.query("SELECT email FROM people WHERE id = 'anon'").get()).toEqual({ email: "k@x.com" });
  expect(sqlite.query("SELECT from_sender FROM doors WHERE id = 'mine'").get()).toEqual({ from_sender: 1 });

  // The owner now owns a knock; deleting it must not cascade away their account and doors.
  sqlite.run(`UPDATE knocks SET token_hash = '${await sha256("tok1")}' WHERE id = 'k1'`);
  expect(await deleteByToken(db, "tok1")).not.toBeNull();
  expect(sqlite.query("SELECT COUNT(*) n FROM users WHERE person_id = 'anon'").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT id FROM doors WHERE id = 'mine'").get()).toEqual({ id: "mine" });
});

test("a door made from a knock's link stores it; a door by someone who knocked before is flagged; a forged id stores nothing", async () => {
  const { db, sqlite } = await fakeDb();
  sqlite.run("PRAGMA foreign_keys = ON");
  const k = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
  sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1); INSERT INTO people (id,email,email_hash,handle,created_at) VALUES ('r','r@x.com','hr','rcv',1), ('s','s@x.com','${await sha256(emailKey("s@x.com"))}',NULL,1);
    INSERT INTO users VALUES ('ur','o','r','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','ur','profile','profile','profile','[]',1);
    INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('${k}','o','d','s','{}','t',1,'bio',1,9e12);`);

  await createDoor(db, input("fromlink"), undefined, undefined, k);
  await createDoor(db, input("forged"), undefined, undefined, "11111111-2222-4333-8444-555555555555");
  await createDoor(db, input("plain"), undefined);
  const sender = await signIn(db, "s@x.com");
  await createDoor(db, input("former"), sender);

  const rows = sqlite.query("SELECT p.handle, d.created_from_knock_id k, d.from_sender f FROM doors d JOIN users u ON u.id = d.owner_user_id JOIN people p ON p.id = u.person_id WHERE d.id <> 'd' ORDER BY p.handle").all();
  expect(rows).toEqual([
    { handle: "forged", k: null, f: 0 },
    { handle: "former", k: null, f: 1 },
    { handle: "fromlink", k, f: 1 },
    { handle: "plain", k: null, f: 0 },
  ]);
  expect((await d1Metrics(db)).fromSenderShare).toBe(2 / 5);
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

const DAY = 86_400_000;

test("sessions time out after 7 idle days, stay alive while used, and refresh at most hourly", async () => {
  const { db, sqlite } = await fakeDb();
  const t0 = Date.now();
  const idle = await signIn(db, "idle@x.com", t0);
  expect(await ownerUser(db, idle, t0 + IDLE_MS + 1_000)).toBeNull();

  const busy = await signIn(db, "busy@x.com", t0);
  expect(await ownerUser(db, busy, t0 + 6 * DAY)).not.toBeNull();
  expect(await ownerUser(db, busy, t0 + 12 * DAY)).not.toBeNull();
  expect(await ownerUser(db, busy, t0 + 12 * DAY + IDLE_MS + 1_000)).toBeNull();

  const hour = await signIn(db, "hour@x.com", t0);
  const row = () => sqlite.query("SELECT last_seen_at s FROM sessions s JOIN people p ON p.id = s.person_id WHERE p.email = 'hour@x.com'").get() as { s: number };
  await ownerUser(db, hour, t0 + 30 * 60_000);
  expect(row().s).toBe(t0);
  await ownerUser(db, hour, t0 + 2 * 3_600_000);
  expect(row().s).toBe(t0 + 2 * 3_600_000);
});

test("signing out removes only that device's session", async () => {
  const { db } = await fakeDb();
  const a = await signIn(db, "a@x.com");
  const b = await signIn(db, "a@x.com");
  expect(await signOut(db, a)).toBe("session");
  expect(await ownerUser(db, a)).toBeNull();
  expect(await ownerUser(db, b)).not.toBeNull();
  expect(await signOut(db, "unknown")).toBe("none");
});

test("signing out with a legacy cookie retires that credential, and refuses when an email is the only way back in", async () => {
  const { db, sqlite } = await fakeDb();
  const session = await signIn(db, "a@x.com");
  sqlite.run(`UPDATE people SET owner_token_hash = '${await sha256("legacy")}'`);
  expect(await ownerUser(db, "legacy")).not.toBeNull();
  expect(await signOut(db, "legacy")).toBe("legacy");
  expect(await ownerUser(db, "legacy")).toBeNull();
  expect(await ownerUser(db, session)).not.toBeNull();
  expect(sqlite.query("SELECT action FROM audit_log WHERE action = 'auth.sign_out_legacy'").all()).toHaveLength(1);

  sqlite.run("INSERT INTO people (id, email, email_hash, handle, owner_token_hash, created_at) VALUES ('anon', 'anon@anon.doorbell.invalid', 'h', 'anon', '" + (await sha256("anon-cookie")) + "', 1)");
  sqlite.run("INSERT INTO orgs VALUES ('o2','o2','free',1); INSERT INTO users VALUES ('u2','o2','anon','owner',1)");
  expect(await signOut(db, "anon-cookie")).toBe("anonymous");
  expect(await ownerUser(db, "anon-cookie")).not.toBeNull();
});

test("sign out everywhere ends every session and the legacy cookie, but only with a real email", async () => {
  const { db, sqlite } = await fakeDb();
  const a = await signIn(db, "a@x.com");
  const b = await signIn(db, "a@x.com");
  sqlite.run(`UPDATE people SET owner_token_hash = '${await sha256("legacy")}'`);
  const o = (await ownerUser(db, a))!;
  expect(await ownerUser(db, "legacy")).not.toBeNull();
  expect(await signOutEverywhere(db, o.userId, o.orgId)).toBe(true);
  expect([await ownerUser(db, a), await ownerUser(db, b), await ownerUser(db, "legacy")]).toEqual([null, null, null]);
  expect(sqlite.query("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 });
  expect(sqlite.query("SELECT action FROM audit_log WHERE action = 'auth.sign_out_all'").all()).toHaveLength(1);

  sqlite.run("INSERT INTO people (id, email, email_hash, handle, owner_token_hash, created_at) VALUES ('anon', 'anon@anon.doorbell.invalid', 'h', 'anon', 'x', 1)");
  sqlite.run("INSERT INTO orgs VALUES ('o2','o2','free',1); INSERT INTO users VALUES ('u2','o2','anon','owner',1)");
  expect(await signOutEverywhere(db, "u2", "o2")).toBe(false);
  expect(sqlite.query("SELECT owner_token_hash h FROM people WHERE id = 'anon'").get()).toEqual({ h: "x" });
});

test("a sign-in while another device is signed in raises an alert; the first, expired and claim ones do not; every sign-in is audited", async () => {
  const { db, sqlite } = await fakeDb();
  const t0 = Date.now();
  const at = async (email: string, now: number, device: string | null = "Chrome on Mac", person: string | null = null) => confirmLink(db, await requestLink(db, email, person, now), now, device);
  const first = await at("a@x.com", t0);
  expect(first.ok && first.alert).toBeNull();
  const second = await at("a@x.com", t0 + 1_000, "Safari on iOS");
  expect(second.ok && second.alert).toBe("a@x.com");
  const later = await at("a@x.com", t0 + IDLE_MS + 10_000);
  expect(later.ok && later.alert).toBeNull();

  const solo = await at("solo@x.com", t0);
  expect(solo.ok && solo.alert).toBeNull();
  const afterIdle = await at("solo@x.com", t0 + IDLE_MS + 10_000);
  expect(afterIdle.ok && afterIdle.alert).toBeNull();

  sqlite.run("INSERT INTO people (id, email, email_hash, handle, created_at) VALUES ('anon', 'anon@anon.doorbell.invalid', 'h', 'anon', 1)");
  sqlite.run("INSERT INTO orgs VALUES ('o2','o2','free',1); INSERT INTO users VALUES ('u2','o2','anon','owner',1)");
  const claim = await at("c@x.com", t0, "Chrome on Mac", "anon");
  expect(claim.ok && claim.alert).toBeNull();

  const rows = sqlite.query("SELECT action, target FROM audit_log WHERE action = 'auth.sign_in' ORDER BY at").all() as { action: string; target: string }[];
  expect(rows.length).toBe(6);
  expect(rows.map((r) => r.target)).toContain("Safari on iOS");
});

test("device labels come from the user agent", () => {
  const ua = (s: string) => deviceLabel(s);
  expect(ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe("Safari on Mac");
  expect(ua("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
  expect(ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Edge on Windows");
  expect(ua("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0")).toBe("Firefox on Linux");
  expect(deviceLabel(undefined)).toBe("Browser on unknown device");
});

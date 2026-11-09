import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { ensurePrefs, setPrefs, unsubscribe } from "./digest";
import { sendWeekly } from "./email";
import { fakeDb } from "./testdb";
import { weeklyJobs } from "./weekly";

// Monday 2026-11-09 08:30 UTC
const MON = Date.UTC(2026, 10, 9, 8, 30);
const H = 3_600_000;
const D = 24 * H;

const seed = (s: Database) => {
  s.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','owner@x.com','h',1),('q','other@x.com','h2',1),('anon','x@anon.doorbell.invalid','ha',1);
    INSERT INTO users VALUES ('u','o','p','owner',1),('u2','o','q','owner',1),('ua','o','anon','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','hiring','referral','referral','[]',1),('d2','o','u2','other','referral','referral','[]',1),('da','o','ua','profile','profile','profile','[]',1);`);
};
const decide = (s: Database, id: string, user: string, answer: string, at: number) =>
  s.run("INSERT INTO decisions (id,org_id,knock_id,actor_user_id,answer,at) VALUES (?,?,?,?,?,?)", [id, "o", `k${id}`, user, answer, at]);

test("weekly picks only owners whose local clock reads Monday 08:00", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  decide(sqlite, "1", "u", "yes", MON - D);
  decide(sqlite, "2", "u2", "no", MON - D);
  await setPrefs(db, "q", { tz: "Asia/Kolkata" });
  const jobs = await weeklyJobs(db, MON);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ type: "weekly", to: "owner@x.com", n: 1 });
  expect(jobs[0]!.token).toMatch(/^[0-9a-f]{32}$/);
});

test("weekly waits for Monday and 08:00 in the owner's zone", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  decide(sqlite, "1", "u", "yes", MON - D);
  expect(await weeklyJobs(db, Date.UTC(2026, 10, 10, 8, 30))).toEqual([]);
  expect(await weeklyJobs(db, Date.UTC(2026, 10, 9, 9, 30))).toEqual([]);
  await setPrefs(db, "p", { tz: "America/New_York" });
  expect(await weeklyJobs(db, Date.UTC(2026, 10, 9, 13, 30))).toHaveLength(1);
});

test("overlapping runs claim an owner once, and the next week is open again", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  decide(sqlite, "1", "u", "yes", MON - D);
  const runs = await Promise.all([weeklyJobs(db, MON), weeklyJobs(db, MON + 15 * 60_000)]);
  expect(runs.flat()).toHaveLength(1);
  expect(await weeklyJobs(db, MON + 5 * 60_000)).toEqual([]);
  decide(sqlite, "2", "u", "later", MON + 6 * D);
  expect(await weeklyJobs(db, MON + 7 * D)).toHaveLength(1);
});

test("weekly counts only the last seven days of real answers and skips zero", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  decide(sqlite, "1", "u", "yes", MON - 8 * D);
  decide(sqlite, "2", "u", "expired", MON - D);
  decide(sqlite, "3", "u2", "pass", MON - D);
  decide(sqlite, "4", "u2", "no", MON - 2 * D);
  decide(sqlite, "5", "u2", "later", MON - 3 * D);
  expect(await weeklyJobs(db, MON)).toMatchObject([{ to: "other@x.com", n: 3 }]);
});

test("unsubscribing from the digest also stops the weekly email", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  decide(sqlite, "1", "u", "yes", MON - D);
  decide(sqlite, "2", "u2", "yes", MON - D);
  await ensurePrefs(db, "p");
  const t = (sqlite.query("SELECT unsub_token t FROM notification_prefs WHERE person_id = 'p'").get() as { t: string }).t;
  expect(await unsubscribe(db, t, MON)).toBe(true);
  expect(await weeklyJobs(db, MON)).toMatchObject([{ to: "other@x.com" }]);
});

test("weekly email has a plain text part, singular wording and the unsubscribe header", async () => {
  let body: { subject: string; text: string; html: string; headers: Record<string, string> } | undefined;
  const fetcher = (async (_u: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "a@b.co", PUBLIC_ORIGIN: "https://d.test" };
  expect(await sendWeekly(env, { to: "o@x.com", n: 1, inbox: "https://d.test/app", unsubscribe: "https://d.test/u/abc" }, fetcher)).toBe("sent");
  expect(body!.subject).toBe("You answered 1 person this week.");
  expect(body!.text).toContain("https://d.test/u/abc");
  expect(body!.html).toContain("at most once a week");
  expect(body!.headers["List-Unsubscribe"]).toBe("<https://d.test/u/abc>");
  expect(await sendWeekly({}, { to: "o@x.com", n: 2, inbox: "i", unsubscribe: "u" }, fetcher)).toBe("unconfigured");
});

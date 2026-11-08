import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { digestJobs, digestOn, localHour, setPrefs, tokenValid, unsubscribe, validTz } from "./digest";
import { sendDigest } from "./email";
import { fakeDb } from "./testdb";

// 2026-11-08 08:30 UTC
const NOW = Date.UTC(2026, 10, 8, 8, 30);
const H = 3_600_000;

const seed = (s: Database) => {
  s.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','owner@x.com','h',1),('anon','x@anon.doorbell.invalid','ha',1),('s1','a@x','h1',1),('s2','b@x','h2',1),('s3','c@x','h3',1),('s4','d@x','h4',1),('s5','e@x','h5',1);
    INSERT INTO users VALUES ('u','o','p','owner',1),('ua','o','anon','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','hiring','referral','referral','[]',1),('da','o','ua','profile','profile','profile','[]',1);`);
};
const knock = (s: Database, id: string, person: string, fit: number | null, at: number, o: { spam?: boolean; status?: string; door?: string; msg?: string } = {}) =>
  s.run(
    `INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,fit,spam,status,token_hash,consent_at,source,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,1,'bio',?,?)`,
    [id, "o", o.door ?? "d", person, JSON.stringify({ message: o.msg ?? `msg ${id}`, answers: [] }), fit, o.spam ? 1 : 0, o.status ?? "new", `t${id}`, at, NOW + 7 * 24 * H],
  );

test("local hour follows the timezone and falls back to UTC", () => {
  expect(localHour("UTC", NOW)).toBe(8);
  expect(localHour("Asia/Kolkata", NOW)).toBe(14);
  expect(localHour("America/New_York", NOW)).toBe(3);
  expect(localHour("Not/AZone", NOW)).toBe(8);
  expect(localHour(null, Date.UTC(2026, 10, 8, 0, 5))).toBe(0);
  expect([validTz("Europe/Berlin"), validTz("nope"), validTz(""), validTz(5)]).toEqual([true, false, false, false]);
});

test("digest goes out at 08:00 local with counts and the top three by fit, spam left out", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  knock(sqlite, "a", "s1", 3, NOW - 2 * H);
  knock(sqlite, "b", "s2", 5, NOW - 3 * H, { msg: "see https://evil.co now" });
  knock(sqlite, "c", "s3", null, NOW - 4 * H);
  knock(sqlite, "d", "s4", 5, NOW - 1 * H, { spam: true });
  knock(sqlite, "e", "s5", 4, NOW - 30 * H);
  knock(sqlite, "x", "s1", 5, NOW - 1 * H, { door: "da" });
  const [job, ...rest] = await digestJobs(db, NOW);
  expect(rest).toEqual([]);
  expect(job).toMatchObject({ type: "digest", to: "owner@x.com", fresh: 4, open: 5 });
  expect(job!.top).toEqual([
    { door: "hiring", fit: 5, excerpt: "see [link removed] now" },
    { door: "hiring", fit: 3, excerpt: "msg a" },
    { door: "hiring", fit: null, excerpt: "msg c" },
  ]);
  expect(job!.token).toMatch(/^[0-9a-f]{32}$/);
});

test("once per day, only with new knocks, only at the owner's 08:00", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  expect(await digestJobs(db, NOW)).toEqual([]);
  knock(sqlite, "a", "s1", 3, NOW + H);
  expect(await digestJobs(db, NOW + 2 * H)).toEqual([]);
  expect(await digestJobs(db, NOW + 24 * H)).toHaveLength(1);
  expect(await digestJobs(db, NOW + 24 * H + 15 * 60_000)).toEqual([]);

  const other = await fakeDb();
  seed(other.sqlite);
  knock(other.sqlite, "a", "s1", 3, NOW - H);
  await setPrefs(other.db, "p", { tz: "Asia/Kolkata" });
  expect(await digestJobs(other.db, NOW)).toEqual([]);
  expect(await digestJobs(other.db, NOW - 6 * H)).toHaveLength(1);
});

test("answered knocks do not count; unsubscribe stops it and the toggle brings it back", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite);
  knock(sqlite, "a", "s1", 3, NOW - H, { status: "answered" });
  expect(await digestJobs(db, NOW)).toEqual([]);

  knock(sqlite, "b", "s2", 4, NOW + 2 * H);
  const [job] = await digestJobs(db, NOW + 24 * H);
  expect(job?.fresh).toBe(1);
  expect(await tokenValid(db, job!.token)).toBe(true);
  expect(await unsubscribe(db, "not-a-token")).toBe(false);
  expect(await unsubscribe(db, job!.token)).toBe(true);
  expect(await digestOn(db, "p")).toBe(false);
  knock(sqlite, "c", "s3", 4, NOW + 30 * H);
  expect(await digestJobs(db, NOW + 48 * H)).toEqual([]);

  await setPrefs(db, "p", { digest: true });
  expect(await digestOn(db, "p")).toBe(true);
  expect(await digestJobs(db, NOW + 72 * H)).toHaveLength(1);
});

test("digest email has one-click unsubscribe headers and strips links", async () => {
  const seen: { body?: string } = {};
  const fetcher = (async (_: unknown, init?: RequestInit) => {
    seen.body = init?.body as string;
    return new Response("{}");
  }) as unknown as typeof fetch;
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  expect(await sendDigest({}, { to: "a@x", fresh: 1, open: 1, top: [], inbox: "i", unsubscribe: "u" })).toBe("unconfigured");
  await sendDigest(env, { to: "o@x.com", fresh: 2, open: 5, top: [{ door: "hiring", fit: 5, excerpt: "go to evil.co" }], inbox: "https://d.dev/app", unsubscribe: "https://d.dev/u/abc" }, fetcher);
  const b = JSON.parse(seen.body!);
  expect(b.subject).toBe("2 new knocks on your door");
  expect(b.headers).toEqual({ "List-Unsubscribe": "<https://d.dev/u/abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  expect(b.text).toContain("- hiring, fit 5/5: go to [link removed]");
  expect(b.text).toContain("Answer them: https://d.dev/app");
  expect(b.text).toContain("Turn it off: https://d.dev/u/abc");
});

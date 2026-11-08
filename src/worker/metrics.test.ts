import { expect, test } from "bun:test";
import { fakeDb } from "./testdb";
import { answerKnock, markSeen, undoKnock } from "./inbox";
import { closeExpired } from "./expire";
import { d1Metrics, firstDoorStats, isAdmin, isBot, verdict, viewSource } from "./metrics";
import { createDoor } from "./doors";

const owner = { userId: "u", orgId: "o" };

test("North Star counts answers, not undone or auto-closed knocks; answer rate includes expiries", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1); INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','p@x','h',1),('s1','a@x','h1',1),('s2','b@x','h2',1),('s3','c@x','h3',1);
    INSERT INTO users VALUES ('u','o','p','owner',1); INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','profile','profile','profile','[]',1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1); INSERT INTO person_stats (person_id,updated_at) VALUES ('s1',1),('s2',1),('s3',1);`);
  const k = (id: string, p: string, exp: number) =>
    sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('${id}','o','d','${p}','{}','t${id}',1,'bio',${now - 1000},${exp})`);
  k("a", "s1", now + 1e6); k("b", "s2", now + 1e6); k("c", "s3", now + 500);

  expect(await markSeen(db, owner, now)).toEqual(["a", "b", "c"]);
  expect(await markSeen(db, owner, now)).toEqual([]);

  await answerKnock(db, owner, "a", { answer: "yes" }, now);
  await answerKnock(db, owner, "b", { answer: "no" }, now);
  await undoKnock(db, owner, "b", now + 1000);
  await closeExpired(db, null, now + 1000);

  const m = await d1Metrics(db, now + 2000);
  expect(m.northStar).toBe(1);
  expect(m.answerRate).toBe(0.5);
  expect(m.receivers).toBe(1);
  expect(m.knocksPerActiveDoor).toBe(3);
  expect(m.outcomes).toBe(0);
});

test("helpers: bots, sources, admin list, verdicts", () => {
  expect(isBot("Twitterbot/1.0")).toBe(true);
  expect(isBot(undefined)).toBe(true);
  expect(isBot("Mozilla/5.0 (iPhone) Safari/604.1")).toBe(false);
  expect([viewSource("reply"), viewSource("bio"), viewSource(undefined), viewSource("x")]).toEqual(["reply", "bio", "direct", "direct"]);
  expect(isAdmin("Me@X.com", " me@x.com, other@y.com")).toBe(true);
  expect(isAdmin("me@x.com", undefined)).toBe(false);
  expect(isAdmin("someone@x.com", "me@x.com")).toBe(false);
  expect([verdict(2, 10, 3), verdict(5, 10, 3), verdict(10, 10, 3), verdict(null, 1)]).toEqual(["kill", "below", "met", "none"]);
});


test("first-door stats: 4 of 5 under 60 s, median, and empty", () => {
  expect(firstDoorStats([20, 30, 45, 59, 90])).toEqual({ n: 5, fast: 4, median: 45 });
  expect(firstDoorStats([60, 10])).toEqual({ n: 2, fast: 1, median: 35 });
  expect(firstDoorStats([])).toEqual({ n: 0, fast: 0, median: null });
});

test("only an owner's first door is timed, and absurd times are dropped", async () => {
  const { db, sqlite } = await fakeDb();
  const input = { handle: "timed", name: "", post: "Hiring a backend engineer in Pune", template: "referral" as const, fields: ["Role"], window: 7 as const };
  const now = Date.now();
  const first = await createDoor(db, input, undefined, now - 42_000);
  expect(first.ok).toBe(true);
  const secs = sqlite.query("SELECT first_door_secs s FROM doors WHERE slug = 'profile'").get() as { s: number } | null;
  expect(secs!.s).toBeGreaterThanOrEqual(41);
  expect(secs!.s).toBeLessThanOrEqual(43);
  const token = first.ok ? first.token : undefined;
  await createDoor(db, { ...input, post: "Second post about a gig" }, token, now - 5_000);
  expect((sqlite.query("SELECT COUNT(*) n FROM doors WHERE first_door_secs IS NOT NULL").get() as { n: number }).n).toBe(1);
  await createDoor(db, { ...input, handle: "slow", post: "" }, undefined, now - 7_200_000);
  expect((sqlite.query("SELECT COUNT(*) n FROM doors WHERE first_door_secs IS NOT NULL").get() as { n: number }).n).toBe(1);
});

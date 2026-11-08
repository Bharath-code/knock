import { expect, test } from "bun:test";
import { fakeDb } from "./testdb";
import { answerKnock, markSeen, undoKnock } from "./inbox";
import { closeExpired } from "./expire";
import { d1Metrics, isAdmin, isBot, verdict, viewSource } from "./metrics";

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

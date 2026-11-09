import { expect, test } from "bun:test";
import { checkinView, dueCheckins, happenedType, recordOutcome } from "./checkin";
import { sendCheckin } from "./email";
import { d1Metrics } from "./metrics";
import { fakeDb } from "./testdb";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1);

const setup = async () => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,handle,display_name,created_at) VALUES ('p','owner@x.com','h','riya','Riya',1),('s1','a@x.com','h1',NULL,NULL,1),('anon','x@anon.doorbell.invalid','ha',NULL,NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','hiring','referral','referral','[]',1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1);
    INSERT INTO person_stats (person_id,updated_at) VALUES ('s1',1);`);
  for (const [id, person] of [["a", "s1"], ["c", "anon"]] as const) {
    t.sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES (?,?,?,?,?,'answered',?,1,'bio',?,?)`, [id, "o", "d", person, "{}", `t${id}`, T0, T0 + 9 * DAY]);
    t.sqlite.run(`INSERT INTO decisions (id,org_id,knock_id,answer,at) VALUES (?,?,?,'yes',?)`, [`dec${id}`, "o", id, T0]);
  }
  return t;
};

test("a Yes gets one check-in per side after 7 days, never before, never twice, nothing to a placeholder sender", async () => {
  const { db } = await setup();
  expect(await dueCheckins(db, T0 + 6 * DAY)).toEqual([]);
  const jobs = await dueCheckins(db, T0 + 7 * DAY);
  expect(jobs.map((j) => [j.side, j.to, j.who]).toSorted()).toEqual([["receiver", "owner@x.com", "Riya"], ["receiver", "owner@x.com", "Riya"], ["sender", "a@x.com", "Riya"]]);
  expect(await dueCheckins(db, T0 + 8 * DAY)).toEqual([]);
});

test("each check-in says which Yes it is about, with links masked", async () => {
  const { db, sqlite } = await setup();
  sqlite.run(`UPDATE knocks SET answers_json = '{"message":"Hi, see https://evil.co/x for my work"}' WHERE id = 'a'`);
  sqlite.run(`UPDATE doors SET kind = 'post', post_text = 'Referring one engineer\nmore text'`);
  const jobs = await dueCheckins(db, T0 + 7 * DAY);
  const mine = jobs.filter((j) => j.to === "a@x.com" || j.about.includes("evil") || j.about.includes("[link"));
  expect(mine.map((j) => j.about)).toContain('"Referring one engineer": "Hi, see [link removed] for my work"');
  const [first] = jobs;
  expect(await checkinView(db, first!.token)).toMatchObject({ about: first!.about });
});

test("a Yes older than three weeks is not chased", async () => {
  const { db } = await setup();
  expect(await dueCheckins(db, T0 + 22 * DAY)).toEqual([]);
});

test("each side reports once; the first real outcome counts once; both real outcomes confirm each other", async () => {
  const { db, sqlite } = await setup();
  const [a, b] = await dueCheckins(db, T0 + 7 * DAY);
  expect(await checkinView(db, a!.token)).toMatchObject({ side: a!.side, who: "Riya", done: false });
  expect(await recordOutcome(db, a!.token, true)).toBe("ok");
  expect(await recordOutcome(db, a!.token, false)).toBe("done");
  expect(await checkinView(db, a!.token)).toMatchObject({ done: true });
  expect(sqlite.query("SELECT type, confirmed_by_both c FROM outcomes").all()).toEqual([{ type: "referred", c: 0 }]);
  expect(await recordOutcome(db, b!.token, true)).toBe("ok");
  expect(sqlite.query("SELECT confirmed_by_both c FROM outcomes").all()).toEqual([{ c: 1 }, { c: 1 }]);
  expect(sqlite.query("SELECT outcomes_total n FROM door_stats").get()).toEqual({ n: 1 });
  expect(sqlite.query("SELECT outcomes_count n FROM person_stats WHERE person_id = 's1'").get()).toEqual({ n: 1 });
  expect((await d1Metrics(db, T0 + 8 * DAY)).outcomes).toBe(1);
});

test("'no' is stored but adds nothing to the counts", async () => {
  const { db, sqlite } = await setup();
  const [a] = await dueCheckins(db, T0 + 7 * DAY);
  expect(await recordOutcome(db, a!.token, false)).toBe("ok");
  expect(sqlite.query("SELECT type FROM outcomes").all()).toEqual([{ type: "none" }]);
  expect(sqlite.query("SELECT outcomes_total n FROM door_stats").get()).toEqual({ n: 0 });
  expect((await d1Metrics(db, T0 + 8 * DAY)).outcomes).toBe(0);
  expect(await recordOutcome(db, "0".repeat(32), true)).toBe("invalid");
  expect(await recordOutcome(db, "zz", true)).toBe("invalid");
  expect(await checkinView(db, "0".repeat(32))).toBeNull();
});

test("what happened depends on the door template; the email masks links", async () => {
  expect([happenedType("referral"), happenedType("beta"), happenedType("gig"), happenedType("profile")]).toEqual(["referred", "tried", "connected", "connected"]);
  let sent: { subject: string; text: string } | undefined;
  const f = (async (_u: string, i: RequestInit) => ((sent = JSON.parse(i.body as string)), new Response("{}"))) as unknown as typeof fetch;
  await sendCheckin({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, { to: "a@x.com", side: "sender", who: "Riya evil.co", link: "https://x.test/o/abc" }, f);
  expect(sent!.subject).toBe("Did it happen with Riya [link removed]?");
  expect(sent!.text).toContain("https://x.test/o/abc");
});

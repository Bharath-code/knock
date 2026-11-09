import { expect, test } from "bun:test";
import { digestOn } from "./digest";
import { sendSeen } from "./email";
import { markSeen } from "./inbox";
import { seenJobs, seenOff, stillSeen } from "./seen";
import { fakeDb } from "./testdb";

const NOW = Date.UTC(2026, 10, 8, 8, 30);
const H = 3_600_000;

const setup = async () => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,handle,display_name,created_at) VALUES ('p','owner@x.com','h','riya','Riya',1),('s1','a@x.com','h1',NULL,NULL,1),('s2','b@x.com','h2',NULL,NULL,1),('anon','x@anon.doorbell.invalid','ha',NULL,NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','hiring','referral','referral','[]',1);`);
  for (const [id, person] of [["a", "s1"], ["b", "s2"], ["c", "anon"]] as const)
    t.sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES (?,?,?,?,?,'new',?,1,'bio',?,?)`, [id, "o", "d", person, "{}", `t${id}`, NOW - H, NOW + 7 * 24 * H]);
  return t;
};

test("a knock is marked seen once, so it yields one job once; placeholder senders get none", async () => {
  const { db } = await setup();
  const ids = await markSeen(db, { userId: "u", orgId: "o" }, NOW);
  expect(ids.toSorted()).toEqual(["a", "b", "c"]);
  const jobs = await seenJobs(db, ids);
  expect(jobs.map((j) => [j.knockId, j.to, j.who]).toSorted()).toEqual([["a", "a@x.com", "Riya"], ["b", "b@x.com", "Riya"]]);
  expect(jobs.every((j) => /^[0-9a-f]{32}$/.test(j.token))).toBe(true);
  expect(await markSeen(db, { userId: "u", orgId: "o" }, NOW + 1)).toEqual([]);
});

test("turning Seen alerts off skips that sender and leaves the digest alone", async () => {
  const { db } = await setup();
  const ids = await markSeen(db, { userId: "u", orgId: "o" }, NOW);
  const [first] = await seenJobs(db, ids);
  expect(await seenOff(db, first!.token)).toBe(true);
  expect(await seenOff(db, "nope")).toBe(false);
  expect((await seenJobs(db, ids)).map((j) => j.to)).not.toContain(first!.to);
  const sender = first!.to === "a@x.com" ? "s1" : "s2";
  expect(await digestOn(db, sender)).toBe(true);
});

test("the email is skipped once the knock is no longer just seen", async () => {
  const { db, sqlite } = await setup();
  await markSeen(db, { userId: "u", orgId: "o" }, NOW);
  expect(await stillSeen(db, "a")).toBe(true);
  sqlite.run("UPDATE knocks SET status = 'answered' WHERE id = 'a'");
  expect(await stillSeen(db, "a")).toBe(false);
});

test("the email masks links in the receiver's name and carries a one-click opt-out", async () => {
  let sent: { subject: string; text: string; headers: Record<string, string> } | undefined;
  const fetcher = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(init.body as string);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const off = "https://x.test/u/abc/seen";
  expect(await sendSeen({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, { to: "a@x.com", who: "Riya evil.co/x", off }, fetcher)).toBe("sent");
  expect(sent!.subject).toBe("Riya [link removed] saw your knock");
  expect(sent!.text).toContain(off);
  expect(sent!.headers["List-Unsubscribe"]).toBe(`<${off}>`);
  expect(await sendSeen({}, { to: "a@x.com", who: "Riya", off }, fetcher)).toBe("unconfigured");
});

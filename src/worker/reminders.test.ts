import { expect, test } from "bun:test";
import { admit, initAdmit, type SqlLike } from "./admit";
import { Database } from "bun:sqlite";
import { release } from "./admit";
import { sendClosure, sendReminder } from "./email";
import { answerKnock, undoKnock } from "./inbox";
import { dueReminders, REMIND_MS } from "./reminders";
import { deleteByToken, purgeClosed } from "./retention";
import { sha256 } from "./doors";
import { fakeDb } from "./testdb";

const NOW = Date.UTC(2026, 10, 8, 8, 30);
const O = { userId: "u", orgId: "o" };

const setup = async () => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,handle,display_name,created_at) VALUES ('p','owner@x.com','h','riya','Riya',1),('s1','a@x.com','h1',NULL,NULL,1),('anon','x@anon.doorbell.invalid','ha',NULL,NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','hiring','referral','referral','[]',1);`);
  for (const [id, person] of [["a", "s1"], ["c", "anon"]] as const)
    t.sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES (?,?,?,?,?,'seen',?,1,'bio',?,?)`, [id, "o", "d", person, "{}", `t${id}`, NOW, NOW + 7 * 86_400_000]);
  return t;
};

test("only Not now makes a reminder, and undo takes it back", async () => {
  const { db, sqlite } = await setup();
  await answerKnock(db, O, "a", { answer: "no" }, NOW);
  expect(sqlite.query("SELECT COUNT(*) AS n FROM reminders").get()).toEqual({ n: 0 });
  sqlite.run("UPDATE knocks SET status = 'seen', answered_at = NULL WHERE id = 'a'; DELETE FROM decisions;");
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  expect(sqlite.query("SELECT remind_at FROM reminders WHERE knock_id = 'a'").get()).toEqual({ remind_at: NOW + REMIND_MS });
  expect(await undoKnock(db, O, "a", NOW + 1000)).toBe(true);
  expect(sqlite.query("SELECT COUNT(*) AS n FROM reminders").get()).toEqual({ n: 0 });
});

test("the reminder survives the purge of its knock and the sender, then goes out once", async () => {
  const { db, sqlite } = await setup();
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  await answerKnock(db, O, "c", { answer: "later" }, NOW);
  const day = NOW + REMIND_MS;
  expect(await dueReminders(db, day + 1)).toEqual([]);
  await purgeClosed(db, day + 1);
  expect(sqlite.query("SELECT COUNT(*) AS n FROM people WHERE id = 's1'").get()).toEqual({ n: 1 });
  expect(await dueReminders(db, day - 1)).toEqual([]);
  const jobs = await dueReminders(db, day + 1);
  expect(jobs).toEqual([{ type: "reminder", to: "a@x.com", who: "Riya", path: "/d/riya/hiring" }]);
  expect(await dueReminders(db, day + 2)).toEqual([]);
});

test("a reminder that can never go out stops holding the sender's email", async () => {
  const { db, sqlite } = await setup();
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  await purgeClosed(db, NOW + REMIND_MS + 31 * 86_400_000);
  expect(sqlite.query("SELECT COUNT(*) AS n FROM reminders").get()).toEqual({ n: 0 });
  expect(sqlite.query("SELECT COUNT(*) AS n FROM people WHERE id = 's1'").get()).toEqual({ n: 0 });
});

test("a sender who deletes the knock cancels the reminder", async () => {
  const { db, sqlite } = await setup();
  sqlite.run("UPDATE knocks SET token_hash = ? WHERE id = 'a'", [await sha256("tok")]);
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  await deleteByToken(db, "tok");
  await purgeClosed(db, NOW + REMIND_MS * 2);
  expect(await dueReminders(db, NOW + REMIND_MS * 2)).toEqual([]);
});

test("emails: the Not now closure names the date; the reminder masks links", async () => {
  const sent: { subject: string; text: string }[] = [];
  const f = (async (_u: string, i: RequestInit) => (sent.push(JSON.parse(i.body as string)), new Response("{}"))) as unknown as typeof fetch;
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" };
  await sendClosure(env, { to: "a@x.com", who: "Riya", message: "Not now.", later: true, again: NOW + REMIND_MS }, f);
  expect(sent[0]!.text).toContain("You can knock again from 2027-02-06");
  await sendClosure(env, { to: "a@x.com", who: "Riya", message: "No.", again: NOW + REMIND_MS }, f);
  expect(sent[1]!.text).not.toContain("knock again from");
  await sendReminder(env, { to: "a@x.com", who: "Riya evil.co", link: "https://x.test/d/riya" }, f);
  expect(sent[2]!.subject).toBe("You can knock again on Riya [link removed]'s door");
});

test("after the purge the sender can knock the door again: the door forgets the key", async () => {
  const { db, sqlite } = await setup();
  const mem = new Database(":memory:");
  const sql: SqlLike = { exec: (q, ...b) => { const rows = mem.query(q).all(...(b as never[])); return { toArray: () => rows }; } };
  initAdmit(sql);
  expect(admit(sql, "a@x.com", "1.1.1.1", NOW)).toBe("ok");
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  expect(admit(sql, "a@x.com", "1.1.1.1", NOW)).toBe("duplicate");
  const freed = await purgeClosed(db, NOW + REMIND_MS + 1);
  expect(freed).toEqual([{ doorId: "d", key: "a@x.com" }]);
  for (const f of freed) release(sql, f.key);
  expect(admit(sql, "a@x.com", "1.1.1.1", NOW + REMIND_MS)).toBe("ok");
  expect(sqlite.query("SELECT COUNT(*) AS n FROM knocks WHERE id = 'a'").get()).toEqual({ n: 0 });
});

test("a key is kept while an alias of it still holds a live knock on the door", async () => {
  const { db, sqlite } = await setup();
  sqlite.run(`INSERT INTO people (id,email,email_hash,created_at) VALUES ('s1b','a+tag@x.com','h1b',1)`);
  sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES ('ab','o','d','s1b','{}','new','tab',1,'bio',?,?)`, [NOW, NOW + 9e9]);
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  expect(await purgeClosed(db, NOW + REMIND_MS + 1)).toEqual([]);
});

test("a No keeps its key: only Not now and expired windows are freed at purge", async () => {
  const { db } = await setup();
  await answerKnock(db, O, "a", { answer: "no" }, NOW);
  expect(await purgeClosed(db, NOW + REMIND_MS + 1)).toEqual([]);
});

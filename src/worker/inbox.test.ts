import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { keyAction, safeProof, sortCards, swipeAnswer, type InboxCard } from "../shared/inbox";
import { bookingUrl } from "../shared/booking";
import { getBooking, setBooking, stillYes, yesJob } from "./booking";
import { answerKnock, closeRest, listInbox, undoKnock } from "./inbox";

const fakeDb = async () => {
  const sqlite = new Database(":memory:");
  for (const f of ["0001_init", "0003_handles"]) sqlite.run(await Bun.file(`migrations/${f}.sql`).text());
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    all: async () => ({ results: sqlite.query(sql).all(...(args as never[])) }),
    first: async () => sqlite.query(sql).get(...(args as never[])),
    run: async () => ({ meta: { changes: sqlite.query(sql).run(...(args as never[])).changes } }),
  });
  return {
    sqlite,
    db: {
      prepare: (sql: string) => stmt(sql),
      batch: async (list: { run: () => Promise<unknown> }[]) => { const out = []; for (const s of list) out.push(await s.run()); return out; },
    } as unknown as D1Database,
  };
};

const seed = (s: Database, now: number) => {
  s.run(`INSERT INTO orgs VALUES ('o','o','free',1); INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','p@x','h',1),('s1','a@x','h1',1),('s2','b@x','h2',1),('s3','c@x','h3',1);
    INSERT INTO users VALUES ('u','o','p','owner',1); INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','profile','profile','profile','[]',1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1); INSERT INTO person_stats (person_id,updated_at) VALUES ('s1',1),('s2',1),('s3',1);`);
  const k = (id: string, p: string, fit: number | null, at: number) =>
    s.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,fit,token_hash,consent_at,source,created_at,expires_at) VALUES ('${id}','o','d','${p}','{"message":"hi","answers":[]}',${fit},'t${id}',1,'bio',${at},${now + 1e6})`);
  k("low", "s1", 2, 10); k("none", "s2", null, 5); k("high", "s3", 5, 20);
};
const owner = { userId: "u", orgId: "o" };

test("inbox sorts by fit then oldest, unscored last", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite, Date.now());
  expect((await listInbox(db, owner)).map((c) => c.id)).toEqual(["high", "low", "none"]);
});

test("answer removes the card once; undo within 5 s restores it, later does not", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  seed(sqlite, now);
  expect(await answerKnock(db, owner, "high", { answer: "yes" }, now)).toBe(true);
  expect(await answerKnock(db, owner, "high", { answer: "no" }, now)).toBe(false);
  expect((await listInbox(db, owner, now)).map((c) => c.id)).toEqual(["low", "none"]);
  expect(sqlite.query("SELECT answered_in_window n FROM door_stats").get()).toEqual({ n: 1 });
  expect(await undoKnock(db, owner, "high", now + 6_000)).toBe(false);
  expect(await undoKnock(db, owner, "high", now + 1_000)).toBe(true);
  expect((await listInbox(db, owner, now)).map((c) => c.id)).toEqual(["high", "low", "none"]);
  expect(sqlite.query("SELECT answered_in_window n FROM door_stats").get()).toEqual({ n: 0 });
  expect(await answerKnock(db, { userId: "other", orgId: "o" }, "low", { answer: "no" }, now)).toBe(false);
});

test("swipe and key maps", () => {
  expect([swipeAnswer(120, 10), swipeAnswer(-120, 10), swipeAnswer(5, -120), swipeAnswer(5, 120), swipeAnswer(20, 20)]).toEqual(["yes", "no", "later", null, null]);
  expect([keyAction("J"), keyAction("y"), keyAction("u"), keyAction("x")]).toEqual([{ type: "move", by: 1 }, { type: "answer", answer: "yes" }, { type: "undo" }, null]);
});

test("proof links allow only http and https", () => {
  expect([safeProof("https://github.com/a"), safeProof("javascript:alert(1)"), safeProof("data:text/html,x"), safeProof(null)]).toEqual(["https://github.com/a", null, null, null]);
});

test("reason and note are stored with the decision", async () => {
  const { db, sqlite } = await fakeDb();
  seed(sqlite, Date.now());
  await answerKnock(db, owner, "low", { answer: "no", reason: "stage", note: "Maybe next year" });
  expect(sqlite.query("SELECT reason_code r, note n FROM decisions WHERE knock_id = 'low'").get()).toEqual({ r: "stage", n: "Maybe next year" });
});

test("close the rest answers every open knock once, logs one audit row, and cannot be undone", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  seed(sqlite, now);
  await answerKnock(db, owner, "high", { answer: "yes" }, now - 60_000);
  const closed = await closeRest(db, owner, now);
  expect(closed.map((c) => c.to).sort()).toEqual(["a@x", "b@x"]);
  expect(await listInbox(db, owner, now)).toEqual([]);
  expect(sqlite.query("SELECT COUNT(*) n FROM decisions WHERE reason_code = 'bulk'").get()).toEqual({ n: 2 });
  expect(sqlite.query("SELECT action, target FROM audit_log").all()).toEqual([{ action: "inbox.close_rest", target: "2 knocks" }]);
  expect(sqlite.query("SELECT answered_in_window n FROM door_stats").get()).toEqual({ n: 3 });
  expect(await undoKnock(db, owner, "low", now + 1_000)).toBe(false);
  expect(await closeRest(db, owner, now + 2_000)).toEqual([]);
  expect(sqlite.query("SELECT COUNT(*) n FROM audit_log").get()).toEqual({ n: 1 });
});

test("client sort matches the server order", () => {
  const c = (id: string, fit: number | null, createdAt: number) => ({ id, fit, createdAt }) as InboxCard;
  expect(sortCards([c("none", null, 1), c("low", 2, 5), c("high-new", 5, 9), c("high-old", 5, 3)]).map((x) => x.id)).toEqual(["high-old", "high-new", "low", "none"]);
});

test("booking links must be https on cal.com or calendly.com", () => {
  const ok = ["https://cal.com/x", "https://app.cal.com/x/15", "https://calendly.com/x", " https://calendly.com/x/30min "];
  const bad = ["http://cal.com/x", "javascript:alert(1)", "https://calendly.com.evil.com/x", "https://evilcal.com/x", "https://user:pw@cal.com/x", "cal.com/x", "", null];
  expect(ok.map(bookingUrl).every(Boolean)).toBe(true);
  expect(bad.map(bookingUrl)).toEqual(bad.map(() => null));
});

test("yes job carries the booking link and is skipped after undo or a re-answer", async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  seed(sqlite, now);
  expect(await setBooking(db, owner, "https://cal.com/akash/15")).toBe(true);
  expect(await getBooking(db, owner)).toBe("https://cal.com/akash/15");
  await answerKnock(db, owner, "high", { answer: "yes", note: "Happy to chat" }, now);
  expect(await yesJob(db, owner, "high", now)).toEqual({ type: "yes", to: "c@x", note: "Happy to chat", url: "https://cal.com/akash/15", knockId: "high", at: now });
  expect(await stillYes(db, "high", now)).toBe(true);
  await undoKnock(db, owner, "high", now + 1_000);
  expect(await stillYes(db, "high", now)).toBe(false);
  await answerKnock(db, owner, "high", { answer: "yes" }, now + 2_000);
  expect(await stillYes(db, "high", now)).toBe(false);
  expect(await stillYes(db, "high", now + 2_000)).toBe(true);
  expect(await yesJob(db, owner, "low", now)).toBeNull();
  await setBooking(db, owner, null);
  expect(await getBooking(db, owner)).toBeNull();
});

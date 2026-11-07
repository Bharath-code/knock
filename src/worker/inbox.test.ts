import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { keyAction, safeProof, swipeAnswer } from "../shared/inbox";
import { answerKnock, listInbox, undoKnock } from "./inbox";

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
  expect(await answerKnock(db, owner, "high", "yes", now)).toBe(true);
  expect(await answerKnock(db, owner, "high", "no", now)).toBe(false);
  expect((await listInbox(db, owner, now)).map((c) => c.id)).toEqual(["low", "none"]);
  expect(sqlite.query("SELECT answered_in_window n FROM door_stats").get()).toEqual({ n: 1 });
  expect(await undoKnock(db, owner, "high", now + 6_000)).toBe(false);
  expect(await undoKnock(db, owner, "high", now + 1_000)).toBe(true);
  expect((await listInbox(db, owner, now)).map((c) => c.id)).toEqual(["high", "low", "none"]);
  expect(sqlite.query("SELECT answered_in_window n FROM door_stats").get()).toEqual({ n: 0 });
  expect(await answerKnock(db, { userId: "other", orgId: "o" }, "low", "no", now)).toBe(false);
});

test("swipe and key maps", () => {
  expect([swipeAnswer(120, 10), swipeAnswer(-120, 10), swipeAnswer(5, -120), swipeAnswer(5, 120), swipeAnswer(20, 20)]).toEqual(["yes", "no", "later", null, null]);
  expect([keyAction("J"), keyAction("y"), keyAction("u"), keyAction("x")]).toEqual([{ type: "move", by: 1 }, { type: "answer", answer: "yes" }, { type: "undo" }, null]);
});

test("proof links allow only http and https", () => {
  expect([safeProof("https://github.com/a"), safeProof("javascript:alert(1)"), safeProof("data:text/html,x"), safeProof(null)]).toEqual(["https://github.com/a", null, null, null]);
});

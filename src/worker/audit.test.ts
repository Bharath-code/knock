import { expect, test } from "bun:test";
import { auditCsv, csvCell, logAudit } from "./audit";
import { answerKnock, closeRest, undoKnock } from "./inbox";
import { fakeDb } from "./testdb";

const NOW = Date.UTC(2026, 10, 8, 8, 30);
const O = { userId: "u", orgId: "o" };

const setup = async () => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1),('x','x','free',1);
    INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','p@x','h',1),('s1','a@x','h1',1),('s2','b@x','h2',1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','profile','profile','profile','[]',1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1);`);
  for (const [id, p] of [["a", "s1"], ["b", "s2"]] as const)
    t.sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES (?,?,?,?,?,'seen',?,1,'bio',?,?)`, [id, "o", "d", p, "{}", `t${id}`, NOW, NOW + 1e9]);
  return t;
};

test("every answer, undo and bulk close writes an audit row with actor and time", async () => {
  const { db, sqlite } = await setup();
  await answerKnock(db, O, "a", { answer: "later" }, NOW);
  await undoKnock(db, O, "a", NOW + 1000);
  await answerKnock(db, O, "a", { answer: "yes" }, NOW + 2000);
  await closeRest(db, O, NOW + 3000);
  expect(sqlite.query("SELECT actor, action, target FROM audit_log ORDER BY at, rowid").all()).toEqual([
    { actor: "u", action: "inbox.later", target: "a" },
    { actor: "u", action: "inbox.undo", target: "a" },
    { actor: "u", action: "inbox.yes", target: "a" },
    { actor: "u", action: "inbox.close_rest", target: "1 knocks" },
  ]);
});

test("an answer that fails (knock already closed) writes nothing", async () => {
  const { db, sqlite } = await setup();
  await answerKnock(db, O, "a", { answer: "no" }, NOW);
  expect(await answerKnock(db, O, "a", { answer: "yes" }, NOW + 1)).toBe(false);
  expect(sqlite.query("SELECT COUNT(*) n FROM audit_log").get()).toEqual({ n: 1 });
});

test("csv: header, ISO time, org scoped, quotes escaped, formulas defused", async () => {
  const { db } = await setup();
  await logAudit(db, O, "settings.booking", "set", NOW);
  await logAudit(db, O, "settings.codes_added", '=HYPERLINK("x"),y', NOW + 1);
  await logAudit(db, { userId: "z", orgId: "x" }, "settings.digest", "off", NOW);
  const csv = await auditCsv(db, O);
  expect(csv.split("\r\n")).toEqual([
    "time,actor,action,target",
    `2026-11-08T08:30:00.001Z,u,settings.codes_added,"'=HYPERLINK(""x""),y"`,
    "2026-11-08T08:30:00.000Z,u,settings.booking,set",
    "",
  ]);
  expect([csvCell(null), csvCell("a,b"), csvCell("+1"), csvCell(5)]).toEqual(["", '"a,b"', "'+1", "5"]);
});

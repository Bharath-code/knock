import { expect, test } from "bun:test";
import { sha256 } from "./doors";
import { deleteByToken, purgeClosed } from "./retention";
import { fakeDb } from "./testdb";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 8);

const setup = async () => {
  const t = await fakeDb();
  const s = t.sqlite;
  s.run("PRAGMA foreign_keys = ON");
  s.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,created_at) VALUES ('p','owner@x','h',1),('s1','a@x','h1',1),('s2','b@x','h2',1),('s3','c@x','h3',1),('s4','d@x','h4',1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','go','referral','referral','[]',1);
    INSERT INTO door_stats (door_id,org_id,knocks_total,updated_at) VALUES ('d','o',4,1);`);
  const knock = async (id: string, person: string, status: string, answered: number | null, expires: number) =>
    s.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,answered_at,expires_at) VALUES (?,?,?,?,?,?,?,1,'bio',1,?,?)`,
      [id, "o", "d", person, "{}", status, await sha256(`tok-${id}`), answered, expires]);
  await knock("old-yes", "s1", "answered", NOW - 91 * DAY, NOW - 80 * DAY);
  await knock("old-expired", "s2", "expired", null, NOW - 95 * DAY);
  await knock("recent", "s3", "answered", NOW - 10 * DAY, NOW);
  await knock("open", "s4", "new", null, NOW + 5 * DAY);
  s.run(`INSERT INTO decisions VALUES ('dec','o','old-yes','u','yes',NULL,NULL,${NOW - 91 * DAY});
    INSERT INTO codes (id,org_id,door_id,code_enc,knock_id,assigned_at) VALUES ('c','o','d','enc','old-yes',${NOW - 91 * DAY});`);
  return t;
};
const ids = (s: import("bun:sqlite").Database, table: string) => (s.query(`SELECT id FROM ${table} ORDER BY id`).all() as { id: string }[]).map((r) => r.id);

test("knocks closed more than 90 days ago are deleted with their decisions and orphaned senders", async () => {
  const { db, sqlite } = await setup();
  await purgeClosed(db, NOW);
  expect(ids(sqlite, "knocks")).toEqual(["open", "recent"]);
  expect(ids(sqlite, "decisions")).toEqual([]);
  expect(ids(sqlite, "people")).toEqual(["p", "s3", "s4"]);
  expect(sqlite.query("SELECT knock_id, assigned_at IS NOT NULL AS used FROM codes").get()).toEqual({ knock_id: null, used: 1 });
  await purgeClosed(db, NOW);
  expect(ids(sqlite, "knocks")).toEqual(["open", "recent"]);
});

test("a sender deletes their own knock with the status token", async () => {
  const { db, sqlite } = await setup();
  expect(await deleteByToken(db, "tok-nope")).toBeNull();
  expect(await deleteByToken(db, "tok-open")).toEqual({ doorId: "d" });
  expect(ids(sqlite, "knocks")).not.toContain("open");
  expect(ids(sqlite, "people")).not.toContain("s4");
  expect(sqlite.query("SELECT knocks_total n FROM door_stats").get()).toEqual({ n: 3 });
  await deleteByToken(db, "tok-recent");
  expect(sqlite.query("SELECT knocks_total n FROM door_stats").get()).toEqual({ n: 3 });
  expect(await deleteByToken(db, "tok-open")).toBeNull();
});

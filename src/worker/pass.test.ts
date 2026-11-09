import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { listInbox, undoKnock } from "./inbox";
import { d1Metrics } from "./metrics";
import { confirmPass, offerPass, PASS_TTL, passView, stillPassed } from "./pass";
import { writeKnock, type KnockWrite } from "./knocks";
import { refreshDoorStats } from "./stats";
import { fakeDb } from "./testdb";

const riya = { userId: "u", orgId: "o" };
const arjun = { userId: "v", orgId: "o" };

const seed = (s: Database, now: number) => {
  s.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,display_name,handle,created_at) VALUES ('p','r@x','h',  'Riya','riya',1),('q','a@x','h0','Arjun','arjun',1),('s1','one@x','h1',NULL,NULL,1),('s2','two@x','h2',NULL,NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1),('v','o','q','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,created_at) VALUES ('d','o','u','profile','profile','profile','["Why?"]',1),('e','o','v','profile','profile','profile','["Your GitHub?"]',1),('f','o','u','side','post','referral','["Why?"]',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,status,created_at) VALUES ('x','o','v','old','post','referral','[]','closed',1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1),('e','o',1),('f','o',1); INSERT INTO person_stats (person_id,updated_at) VALUES ('s1',1),('s2',1);`);
  const k = (id: string, door: string, p: string) =>
    s.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('${id}','o','${door}','${p}','{"message":"hi there","answers":[{"q":"Why?","a":"because"}]}','t${id}',1,'bio',${now - 1000},${now + 1e8})`);
  k("k1", "d", "s1"); k("k2", "d", "s2"); k("k3", "e", "s2");
};

const setup = async () => {
  const { db, sqlite } = await fakeDb();
  const now = Date.now();
  seed(sqlite, now);
  let calls = 0;
  const env = {
    DB: db,
    DOOR: {
      getByName: () => ({
        knock: async (k: KnockWrite) => {
          calls++;
          try {
            return { ok: true as const, ...(await writeKnock(db, k, now)) };
          } catch (e) {
            if (e instanceof Error && /UNIQUE constraint failed: knocks\./.test(e.message)) return { ok: false as const, reason: "duplicate" as const };
            throw e;
          }
        },
      }),
    },
  } as unknown as Pick<Env, "DB" | "DOOR">;
  const count = (sql: string) => (sqlite.query(sql).get() as { n: number }).n;
  return { db, sqlite, now, env, calls: () => calls, count };
};

test("offer validates the target", async () => {
  const { db, now } = await setup();
  const r = (target: string, id = "k1") => offerPass(db, riya, id, target, "", now);
  expect(await r("nonsense")).toMatchObject({ ok: false, reason: "target" });
  expect(await r("/d/nobody/none")).toMatchObject({ ok: false, reason: "target" });
  expect(await r("d")).toMatchObject({ ok: false, reason: "target" });
  expect(await r("https://doorbell.example/d/riya")).toMatchObject({ ok: false, reason: "target" });
  expect(await r("https://doorbell.example/d/arjun/old")).toMatchObject({ ok: false, reason: "target" });
  expect(await offerPass({ ...db } as D1Database, arjun, "k1", "d", "", now)).toMatchObject({ ok: false, reason: "open" });
  const ok = await r("f", "k1");
  expect(ok).toMatchObject({ ok: true, by: "Riya", toName: "Riya" });
});

test("nothing reaches the new door until the one tap; confirm creates one linked knock and is idempotent", async () => {
  const { db, sqlite, now, env, calls, count } = await setup();
  const offer = await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "Arjun hires for this https://spam.example", now);
  if (!offer.ok) throw new Error(offer.reason);
  expect(offer.note).toBe("Arjun hires for this [link removed]");
  expect(offer.to).toBe("one@x");
  expect(count("SELECT COUNT(*) n FROM knocks WHERE door_id = 'e' AND person_id = 's1'")).toBe(0);
  expect(calls()).toBe(0);
  expect(sqlite.query("SELECT answer, note FROM decisions WHERE knock_id = 'k1'").get()).toEqual({ answer: "pass", note: offer.note });
  expect(sqlite.query("SELECT status FROM knocks WHERE id = 'k1'").get()).toEqual({ status: "answered" });
  expect(count("SELECT COUNT(*) n FROM audit_log WHERE action = 'inbox.pass'")).toBe(1);
  expect(sqlite.query("SELECT passes_out, answered_in_window FROM door_stats WHERE door_id = 'd'").get()).toEqual({ passes_out: 1, answered_in_window: 1 });
  expect(await passView(db, offer.token, now)).toMatchObject({ by: "Riya", toName: "Arjun", status: "pending", expired: false });

  const first = await confirmPass(env, offer.token, "ip", now);
  expect(first).toMatchObject({ ok: true, already: false, to: "one@x", who: "Arjun" });
  const second = await confirmPass(env, offer.token, "ip", now);
  expect(second).toEqual({ ok: true, already: true });
  expect(calls()).toBe(1);
  expect(count("SELECT COUNT(*) n FROM knocks WHERE door_id = 'e' AND person_id = 's1'")).toBe(1);
  expect(sqlite.query("SELECT source, passed_from_knock_id AS f FROM knocks WHERE door_id = 'e' AND person_id = 's1'").get()).toEqual({ source: "pass", f: "k1" });
  const p = sqlite.query("SELECT status, sender_consent_at AS c, new_knock_id AS n FROM passes").get() as { status: string; c: number; n: string };
  expect(p.status).toBe("accepted");
  expect(p.c).toBe(now);
  expect(p.n).toBe(first.ok && !first.already ? first.id : "");
  expect(JSON.parse((sqlite.query("SELECT answers_json a FROM knocks WHERE id = ?1").get(first.ok && !first.already ? first.id : "") as { a: string }).a).answers).toEqual([{ q: "Why?", a: "because" }]);
  expect(await confirmPass(env, "0".repeat(32), "ip", now)).toEqual({ ok: false, reason: "invalid" });
});

test("the new receiver sees who passed it", async () => {
  const { db, env, now } = await setup();
  const offer = await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "good fit", now);
  if (!offer.ok) throw new Error(offer.reason);
  await confirmPass(env, offer.token, "ip", now);
  const cards = await listInbox(db, arjun, now);
  expect(cards.find((c) => c.message.includes("hi there") && c.passedBy)?.passedBy).toBe("Riya");
  expect(cards.find((c) => c.message.includes("Passed by Riya: good fit"))).toBeDefined();
  expect(cards.filter((c) => c.passedBy)).toHaveLength(1);
  expect((await listInbox(db, riya, now)).every((c) => !c.passedBy)).toBe(true);
});

test("undo removes the pending pass and the delayed email is skipped", async () => {
  const { db, sqlite, now, env, count } = await setup();
  const offer = await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "", now);
  if (!offer.ok) throw new Error(offer.reason);
  expect(await stillPassed(db, "k1", now)).toBe(true);
  expect(await undoKnock(db, riya, "k1", now + 1_000)).toBe(true);
  expect(await stillPassed(db, "k1", now)).toBe(false);
  expect(count("SELECT COUNT(*) n FROM passes")).toBe(0);
  expect(sqlite.query("SELECT passes_out, answered_in_window FROM door_stats WHERE door_id = 'd'").get()).toEqual({ passes_out: 0, answered_in_window: 0 });
  expect(await confirmPass(env, offer.token, "ip", now)).toEqual({ ok: false, reason: "invalid" });
  expect((await listInbox(db, riya, now)).map((c) => c.id)).toContain("k1");
});

test("a sender who knocked on the target meanwhile, a closed target and an expired pass are refused at confirm", async () => {
  const { db, sqlite, now, env, calls } = await setup();
  const offer = await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "", now);
  if (!offer.ok) throw new Error(offer.reason);
  expect(await confirmPass(env, offer.token, "ip", now + PASS_TTL + 1)).toEqual({ ok: false, reason: "expired" });
  sqlite.run("UPDATE doors SET status = 'closed' WHERE id = 'e'");
  expect(await confirmPass(env, offer.token, "ip", now)).toEqual({ ok: false, reason: "closed" });
  sqlite.run("UPDATE doors SET status = 'open' WHERE id = 'e'");
  sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('kx','o','e','s1','{}','tkx',1,'bio',1,${now + 1e6})`);
  expect(await confirmPass(env, offer.token, "ip", now)).toEqual({ ok: false, reason: "knocked" });
  expect(calls()).toBe(0);
  expect(sqlite.query("SELECT status FROM passes").get()).toEqual({ status: "pending" });
});

test("passes per week are counted by status, and passing keeps the answer rate", async () => {
  const { db, sqlite, now, env } = await setup();
  const a = await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "", now);
  const b = await offerPass(db, riya, "k2", "f", "", now);
  if (!a.ok || !b.ok) throw new Error("offer");
  await confirmPass(env, a.token, "ip", now);
  sqlite.run(`UPDATE passes SET created_at = ${now - 30 * 86_400_000} WHERE to_door_id = 'f'`);
  expect((await d1Metrics(db, now)).passes).toEqual({ pending: 0, accepted: 1, declined: 0 });
  sqlite.run(`UPDATE passes SET created_at = ${now} WHERE to_door_id = 'f'`);
  expect((await d1Metrics(db, now)).passes).toEqual({ pending: 1, accepted: 1, declined: 0 });
  for (let n = 0; n < 8; n++) {
    sqlite.run(`INSERT INTO people (id,email,email_hash,created_at) VALUES ('z${n}','z${n}@x','hz${n}',1); INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,token_hash,consent_at,source,created_at,expires_at) VALUES ('kz${n}','o','d','z${n}','{}','tz${n}',1,'bio',${now - 1000},${now + 1e6})`);
    sqlite.run(`INSERT INTO decisions (id,org_id,knock_id,actor_user_id,answer,at) VALUES ('dz${n}','o','kz${n}','u','${n < 2 ? "expired" : "no"}',${now})`);
  }
  await refreshDoorStats(db, now + 1000);
  expect((sqlite.query("SELECT answer_rate_90d r FROM door_stats WHERE door_id = 'd'").get() as { r: number }).r).toBeCloseTo(8 / 10);
});

test("offering to a door the sender already knocked on looks like any offer; confirm refuses it for the sender only", async () => {
  const { db, sqlite, now, env, calls, count } = await setup();
  const offer = await offerPass(db, riya, "k2", "https://doorbell.example/d/arjun", "", now);
  expect(offer).toMatchObject({ ok: true, by: "Riya", toName: "Arjun" });
  if (!offer.ok) throw new Error(offer.reason);
  expect(Object.keys(offer).sort()).toEqual(Object.keys((await offerPass(db, riya, "k1", "https://doorbell.example/d/arjun", "", now)) as object).sort());
  const before = count("SELECT COUNT(*) n FROM knocks");
  expect(await confirmPass(env, offer.token, "ip", now)).toEqual({ ok: false, reason: "knocked" });
  expect(count("SELECT COUNT(*) n FROM knocks")).toBe(before);
  expect(calls()).toBe(0);
  expect(sqlite.query("SELECT status FROM passes WHERE from_knock_id = 'k2'").get()).toEqual({ status: "pending" });
});

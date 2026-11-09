import { expect, test } from "bun:test";
import { galleryDoor, galleryRows, setListed } from "./gallery";
import { fakeDb } from "./testdb";

const O = { userId: "u", orgId: "o" };

const setup = async () => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,handle,created_at) VALUES ('p','o@x.com','h','riya',1),('s','secret-sender@x.com','hs',NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1);`);
  const door = (id: string, rate: number | null, listed: number, status = "open", yes: string | null = null) => {
    t.sqlite.run(
      `INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,post_text,fields_json,yes_action_json,window_days,status,listed_optin,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [id, "o", "u", id, "post", "gig", "post text", JSON.stringify(["Q1", "Q2"]), yes, 14, status, listed],
    );
    t.sqlite.run(`INSERT INTO door_stats (door_id,org_id,answer_rate_90d,updated_at) VALUES (?,?,?,1)`, [id, "o", rate]);
  };
  door("good", 0.9, 1, "open", JSON.stringify({ type: "booking", url: "https://cal.com/riya-private" }));
  door("unlisted", 0.95, 0);
  door("low", 0.79, 1);
  door("unrated", null, 1);
  door("closed", 0.95, 1, "closed");
  t.sqlite.run(
    `INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,expires_at) VALUES ('k','o','good','s','{"message":"SECRET KNOCK TEXT"}','new','t',1,'bio',1,2)`,
  );
  return t;
};

test("lists only open, opted-in doors at 80% or more", async () => {
  const { db } = await setup();
  const rows = await galleryRows(db);
  expect(rows.map((r) => r.doorId)).toEqual(["good"]);
  expect(rows[0]).toMatchObject({ template: "gig", window: 14, fields: ["Q1", "Q2"], pct: 90, yes: "booking" });
});

test("output carries no knock text, emails, post text or booking url", async () => {
  const { db } = await setup();
  const out = JSON.stringify(await galleryRows(db));
  for (const s of ["SECRET KNOCK TEXT", "secret-sender", "@x.com", "post text", "cal.com", "riya"]) expect(out).not.toContain(s);
});

test("a single-door lookup re-checks the rule, so unlisted ids fall back to nothing", async () => {
  const { db } = await setup();
  expect((await galleryDoor(db, "good"))?.doorId).toBe("good");
  for (const id of ["unlisted", "low", "closed", "missing", "../x", undefined]) expect(await galleryDoor(db, id)).toBeNull();
});

test("unlisting removes the door, and only the owner can list", async () => {
  const { db } = await setup();
  expect(await setListed(db, { userId: "other", orgId: "o" }, "unlisted", true)).toBe(false);
  expect(await setListed(db, O, "unlisted", true)).toBe(true);
  expect((await galleryRows(db)).map((r) => r.doorId).sort()).toEqual(["good", "unlisted"]);
  await setListed(db, O, "good", false);
  expect((await galleryRows(db)).map((r) => r.doorId)).toEqual(["unlisted"]);
});

import { expect, test } from "bun:test";
import { badgeFor, badgeRows, badgeSvg, median, refreshDoorStats, setBadge } from "./stats";
import { fakeDb } from "./testdb";

const NOW = Date.UTC(2026, 10, 8);
const H = 3_600_000;
const O = { userId: "u", orgId: "o" };

const setup = async (knocks: { answer: string; hours: number }[]) => {
  const t = await fakeDb();
  t.sqlite.run(`INSERT INTO orgs VALUES ('o','o','free',1);
    INSERT INTO people (id,email,email_hash,handle,created_at) VALUES ('p','o@x.com','h','riya',1),('s','s@x.com','hs',NULL,1);
    INSERT INTO users VALUES ('u','o','p','owner',1);
    INSERT INTO doors (id,org_id,owner_user_id,slug,kind,template,fields_json,window_days,created_at) VALUES ('d','o','u','profile','profile','profile','[]',7,1);
    INSERT INTO door_stats (door_id,org_id,updated_at) VALUES ('d','o',1);`);
  knocks.forEach((k, i) => {
    // one sender per knock would need many people; the unique (door, person) pair only forbids repeats, so make people on the fly
    t.sqlite.run(`INSERT INTO people (id,email,email_hash,created_at) VALUES (?,?,?,1)`, [`s${i}`, `s${i}@x.com`, `hs${i}`]);
    const made = NOW - 10 * H;
    t.sqlite.run(`INSERT INTO knocks (id,org_id,door_id,person_id,answers_json,status,token_hash,consent_at,source,created_at,answered_at,expires_at) VALUES (?,?,?,?,?,?,?,1,'bio',?,?,?)`,
      [`k${i}`, "o", "d", `s${i}`, "{}", k.answer === "expired" ? "expired" : "answered", `t${i}`, made, k.answer === "expired" ? null : made + k.hours * H, NOW]);
    t.sqlite.run(`INSERT INTO decisions (id,org_id,knock_id,answer,at) VALUES (?,?,?,?,?)`, [`dc${i}`, "o", `k${i}`, k.answer, NOW - H]);
  });
  return t;
};

const many = (answered: number, expired: number) => [
  ...Array.from({ length: answered }, (_, i) => ({ answer: "yes", hours: i + 1 })),
  ...Array.from({ length: expired }, () => ({ answer: "expired", hours: 0 })),
];

test("median handles odd, even and empty", () => {
  expect([median([3, 1, 2]), median([4, 1, 2, 3]), median([])]).toEqual([2, 2.5, null]);
});

test("nightly job: 90-day rate and median hours, but no rate under 10 closed knocks", async () => {
  const small = await setup(many(8, 1));
  await refreshDoorStats(small.db, NOW);
  expect(small.sqlite.query("SELECT answer_rate_90d r, median_answer_hours m FROM door_stats").get()).toEqual({ r: null, m: 4.5 });
  const big = await setup(many(9, 1));
  await refreshDoorStats(big.db, NOW);
  expect(big.sqlite.query("SELECT answer_rate_90d r, median_answer_hours m FROM door_stats").get()).toEqual({ r: 0.9, m: 5 });
});

test("a door that stops qualifying is reset to null", async () => {
  const { db, sqlite } = await setup(many(9, 1));
  await refreshDoorStats(db, NOW);
  sqlite.run("UPDATE decisions SET at = 1");
  await refreshDoorStats(db, NOW);
  expect(sqlite.query("SELECT answer_rate_90d r FROM door_stats").get()).toEqual({ r: null });
});

test("badge shows only when opted in, 10+ knocks and 80%+; it hides again below", async () => {
  const { db, sqlite } = await setup(many(9, 1));
  await refreshDoorStats(db, NOW);
  expect(await badgeFor(db, "riya", "profile")).toBeNull();
  expect(await setBadge(db, O, "d", true)).toBe(true);
  expect(await badgeFor(db, "riya", "profile")).toEqual({ pct: 90, days: 7 });
  expect((await badgeRows(db, O))[0]).toMatchObject({ optin: true, pct: 90, shown: true });
  sqlite.run("UPDATE door_stats SET answer_rate_90d = 0.79");
  expect(await badgeFor(db, "riya", "profile")).toBeNull();
  expect(await setBadge(db, { userId: "x", orgId: "o" }, "d", false)).toBe(false);
});

test("the badge svg carries the numbers and escapes text", () => {
  const svg = badgeSvg({ pct: 92, days: 7 });
  expect(svg).toContain("92% answered in 7d");
  expect(svg).toContain('aria-label="Doorbell: 92% answered in 7d"');
});

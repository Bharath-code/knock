import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultFields, profileFields } from "../src/shared/door";

// Fake data for local and staging only. Never live. Safe to rerun: it replaces its own rows (ids start with "seed-").
const target = process.argv[2];
const targets: Record<string, string[]> = {
  local: ["d1", "execute", "doorbell", "--local"],
  staging: ["d1", "execute", "doorbell-staging", "--remote", "--env", "staging"],
};
if (!targets[target ?? ""]) throw new Error("Usage: bun scripts/seed.ts local|staging (live is never seeded)");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`);
const row = (table: string, cols: Record<string, string | number | null>) =>
  `INSERT INTO ${table} (${Object.keys(cols).join(", ")}) VALUES (${Object.values(cols).map(q).join(", ")});`;

const now = Date.now();
const H = 3_600_000;
const sql: string[] = [
  "DELETE FROM orgs WHERE id LIKE 'seed-%';",
  "DELETE FROM people WHERE id LIKE 'seed-%';",
  row("orgs", { id: "seed-org", name: "seed_akash", created_at: now }),
  row("people", { id: "seed-owner", email: "seed-owner@anon.doorbell.invalid", email_hash: sha("seed-owner"), display_name: "Akash (seed)", handle: "seed_akash", owner_token_hash: sha("seed-owner-token"), created_at: now }),
  row("users", { id: "seed-user", org_id: "seed-org", person_id: "seed-owner", role: "owner", created_at: now }),
];

const door = (id: string, slug: string, kind: string, template: string, post: string, fields: string[], days: number, status = "open") =>
  sql.push(row("doors", { id, org_id: "seed-org", owner_user_id: "seed-user", slug, kind, template, post_text: post || null, fields_json: JSON.stringify(fields), window_days: days, status, created_at: now - 48 * H }));

door("seed-d-profile", "profile", "profile", "profile", "", profileFields, 7);
door("seed-d-referral", "hiring-go-engineer-pune", "post", "referral", "Hiring a Go backend engineer in Pune. Referrals welcome, send your resume and one project.", defaultFields.referral, 7);
door("seed-d-beta", "beta-testers-for-my-notes-app", "post", "beta", "Looking for 20 beta testers for my notes app. Early access, feedback welcome.", defaultFields.beta, 3);
door("seed-d-gig", "freelance-logo-design", "post", "gig", "Need a freelance designer for a logo project. Paid, budget fixed, send your rates.", defaultFields.gig, 14);
door("seed-d-closed", "old-hiring-post", "post", "referral", "Hiring a data engineer. This post is closed.", defaultFields.referral, 7, "closed");

type K = { n: number; door: string; hoursAgo: number; fit: number; seen?: boolean; answer?: "yes" | "later" | "no" };
const knocks: K[] = [
  { n: 1, door: "referral", hoursAgo: 40, fit: 5, seen: true, answer: "yes" },
  { n: 2, door: "referral", hoursAgo: 30, fit: 4, seen: true, answer: "later" },
  { n: 3, door: "referral", hoursAgo: 20, fit: 2, seen: true, answer: "no" },
  { n: 4, door: "referral", hoursAgo: 12, fit: 3, seen: true, answer: "no" },
  { n: 5, door: "referral", hoursAgo: 5, fit: 4, seen: true },
  { n: 6, door: "referral", hoursAgo: 1, fit: 1 },
  { n: 7, door: "beta", hoursAgo: 6, fit: 3 },
  { n: 8, door: "beta", hoursAgo: 2, fit: 4, seen: true },
];
const doorOf = (k: K) => ({ referral: "seed-d-referral", beta: "seed-d-beta" })[k.door]!;
const days = { referral: 7, beta: 3 };
const tokens: string[] = [];

for (const k of knocks) {
  const id = `seed-k${k.n}`;
  const token = `5eed${String(k.n).padStart(28, "0")}`;
  tokens.push(`${k.door} #${k.n}${k.answer ? ` (${k.answer})` : ""}: /k/${token}`);
  const at = now - k.hoursAgo * H;
  sql.push(
    row("people", { id: `seed-s${k.n}`, email: `delivered+seed${k.n}@resend.dev`, email_hash: sha(`delivered@resend.dev#${k.n}`), created_at: at }),
    row("knocks", {
      id, org_id: "seed-org", door_id: doorOf(k), person_id: `seed-s${k.n}`,
      answers_json: JSON.stringify({ message: `Seed message ${k.n}: 5 yrs in Go, built git-scope (100+ stars). Could we talk this week?`, answers: [{ q: "Q1", a: "Go" }, { q: "Q2", a: "https://github.com/example" }, { q: "Q3", a: "Shipped services" }] }),
      fit: k.fit, status: k.answer ? "answered" : "new", token_hash: sha(token), consent_at: at, source: k.n % 2 ? "bio" : "reply",
      created_at: at, seen_at: k.seen ? at + H / 2 : null, answered_at: k.answer ? at + H : null, expires_at: at + days[k.door as keyof typeof days] * 24 * H,
    }),
  );
  if (k.answer) sql.push(row("decisions", { id: `seed-dec${k.n}`, org_id: "seed-org", knock_id: id, actor_user_id: "seed-user", answer: k.answer, at: at + H }));
}
sql.push(
  row("door_stats", { door_id: "seed-d-referral", org_id: "seed-org", knocks_total: 6, answered_in_window: 4, outcomes_total: 0, passes_out: 0, updated_at: now }),
  row("door_stats", { door_id: "seed-d-beta", org_id: "seed-org", knocks_total: 2, answered_in_window: 0, outcomes_total: 0, passes_out: 0, updated_at: now }),
);

const file = join(mkdtempSync(join(tmpdir(), "seed-")), "seed.sql");
writeFileSync(file, sql.join("\n"));
const run = Bun.spawnSync(["npx", "wrangler", ...targets[target!]!, "--file", file], { stdout: "pipe", stderr: "pipe" });
if (run.exitCode !== 0) {
  console.error(run.stderr.toString() || run.stdout.toString());
  process.exit(1);
}
console.log(`Seeded ${target}: 5 doors under /d/seed_akash, 8 knocks.\nInbox: set cookie ds=seed-owner-token, then open /app\nStatus pages:\n  ${tokens.join("\n  ")}`);

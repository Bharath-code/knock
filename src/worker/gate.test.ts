import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { CHECKS_PER_HOUR, pruneLimits, verifyTurnstile, withinLimit } from "./gate";

const fakeDb = async () => {
  const sqlite = new Database(":memory:");
  sqlite.run(await Bun.file("migrations/0002_rate_limits.sql").text());
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => sqlite.query(sql).get(...(args as never[])),
        run: async () => sqlite.query(sql).run(...(args as never[])),
      }),
    }),
  } as unknown as D1Database;
};

test("20 checks per IP per hour, then blocked; other IPs and the next hour are fresh", async () => {
  const db = await fakeDb();
  const t = Date.UTC(2026, 10, 7, 12, 0);
  for (let i = 0; i < CHECKS_PER_HOUR; i++) expect(await withinLimit(db, "a", t)).toBe(true);
  expect(await withinLimit(db, "a", t)).toBe(false);
  expect(await withinLimit(db, "b", t)).toBe(true);
  expect(await withinLimit(db, "a", t + 3_600_000)).toBe(true);
  await pruneLimits(db, t + 48 * 3_600_000);
});

test("turnstile passes only on success:true and fails closed on errors or empty tokens", async () => {
  const reply = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
  expect(await verifyTurnstile("s", "tok", "1.1.1.1", reply({ success: true }))).toBe(true);
  expect(await verifyTurnstile("s", "tok", "1.1.1.1", reply({ success: false }))).toBe(false);
  expect(await verifyTurnstile("s", "", "1.1.1.1", reply({ success: true }))).toBe(false);
  const boom = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  expect(await verifyTurnstile("s", "tok", "1.1.1.1", boom)).toBe(false);
});

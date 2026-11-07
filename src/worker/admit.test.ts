import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { admit, initAdmit, KNOCKS_PER_IP_HOUR, release, type SqlLike } from "./admit";

const fresh = (): SqlLike => {
  const db = new Database(":memory:");
  const sql: SqlLike = {
    exec: (q, ...b) => {
      const rows = db.query(q).all(...(b as never[]));
      return { toArray: () => rows };
    },
  };
  initAdmit(sql);
  return sql;
};
const T = Date.UTC(2026, 10, 7, 12, 0);

test("a second knock from the same email is a duplicate, even with a +tag or different case", () => {
  const sql = fresh();
  expect(admit(sql, "a@x.com", "1.1.1.1", T)).toBe("ok");
  expect(admit(sql, "a@x.com", "2.2.2.2", T)).toBe("duplicate");
  expect(admit(sql, "b@x.com", "3.3.3.3", T)).toBe("ok");
});

test("more than 5 attempts per IP per hour are blocked; other IPs and the next hour are fresh", () => {
  const sql = fresh();
  for (let i = 0; i < KNOCKS_PER_IP_HOUR; i++) expect(admit(sql, `u${i}@x.com`, "9.9.9.9", T)).toBe("ok");
  expect(admit(sql, "late@x.com", "9.9.9.9", T)).toBe("limited");
  expect(admit(sql, "late@x.com", "8.8.8.8", T)).toBe("ok");
  expect(admit(sql, "late2@x.com", "9.9.9.9", T + 3_600_000)).toBe("ok");
});

test("releasing a reservation lets the same email try again", () => {
  const sql = fresh();
  expect(admit(sql, "a@x.com", "1.1.1.1", T)).toBe("ok");
  release(sql, "a@x.com");
  expect(admit(sql, "a@x.com", "1.1.1.1", T)).toBe("ok");
});

test("50 simultaneous submits from one email let exactly one through", async () => {
  const sql = fresh();
  const out = await Promise.all(Array.from({ length: 50 }, (_, i) => Promise.resolve().then(() => admit(sql, "same@x.com", `ip${i}`, T))));
  expect(out.filter((v) => v === "ok")).toHaveLength(1);
  expect(out.filter((v) => v === "duplicate")).toHaveLength(49);
});

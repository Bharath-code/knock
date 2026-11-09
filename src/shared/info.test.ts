import { expect, test } from "bun:test";
import { CHANGELOG } from "./changelog";
import { FAQ } from "./faq";

test("changelog is newest first with real dates and at least one point each", () => {
  const dates = CHANGELOG.map((r) => r.date);
  expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))).toBe(true);
  expect(dates).toEqual(dates.toSorted().toReversed());
  expect(CHANGELOG.every((r) => r.title && r.points.length > 0)).toBe(true);
});

test("faq has ten distinct questions with answers", () => {
  expect(FAQ).toHaveLength(10);
  expect(new Set(FAQ.map((f) => f.q)).size).toBe(10);
  expect(FAQ.every((f) => f.q.endsWith("?") && f.a.length > 20)).toBe(true);
});

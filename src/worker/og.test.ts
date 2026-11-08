import { expect, test } from "bun:test";

// og.ts imports wasm and a vite ?inline font, so stub both for bun
import { mock } from "bun:test";
mock.module("@resvg/resvg-wasm/index_bg.wasm", () => ({ default: {} }));
mock.module("@fontsource/figtree/files/figtree-latin-800-normal.woff?inline", () => ({ default: "" }));
mock.module("@resvg/resvg-wasm", () => ({ initWasm: async () => {}, Resvg: class {} }));
const { answeredSvg, scoreSvg } = await import("./og");

test("score is clamped to 1-5 and junk falls back to 1", () => {
  expect(scoreSvg("9")).toContain(">5/5<");
  expect(scoreSvg("0")).toContain(">1/5<");
  expect(scoreSvg("<script>")).toContain(">1/5<");
  expect(scoreSvg("3.5")).toContain(">1/5<");
});

test("answered card shows count and time, escapes input, carries no names", () => {
  expect(answeredSvg("1", "5")).toContain("1 person");
  expect(answeredSvg("7", "90")).toContain("7 people");
  expect(answeredSvg("7", "90")).toContain("got closure in 2 h");
  expect(answeredSvg("7", "3000")).toContain("2 days");
  expect(answeredSvg("<b>", "x")).not.toContain("<b>");
  expect(answeredSvg("5000", "1")).toContain("999 people");
});

test("rewrite card shows only the two scores", async () => {
  const { rewriteSvg } = await import("./og");
  const s = rewriteSvg("2", "5");
  expect(s).toContain(">2/5<");
  expect(s).toContain(">5/5<");
  expect(rewriteSvg("<x>", "9")).toContain(">0/5<");
});

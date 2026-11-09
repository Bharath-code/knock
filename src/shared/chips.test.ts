import { expect, test } from "bun:test";
import { findQuote, groundChips, splitAround } from "./chips";

test("a quote is found loosely, a missing one is not", () => {
  expect(findQuote("I shipped a Go CLI\nwith 100+ stars", "go cli with   100+ STARS")).toEqual([12, 34]);
  expect(findQuote("hello", "world")).toBeNull();
  expect(findQuote("hello", "he")).toBeNull();
});

test("no evidence, no chip: ungrounded, empty and malformed chips are dropped; at most three are kept", () => {
  const texts = ["I built a Go CLI", "Ex-Stripe, 8 years", "https://github.com/me/tool"];
  const chips = groundChips(
    [
      { label: "Go CLI", quote: "built a go cli" },
      { label: "Invented", quote: "won a Turing award" },
      { label: "", quote: "Ex-Stripe" },
      { label: "Stripe", quote: "Ex-Stripe" },
      { label: "Repo", quote: "github.com/me/tool" },
      { label: "Years", quote: "8 years" },
      null,
    ],
    texts,
  );
  expect(chips.map((c) => c.label)).toEqual(["Go CLI", "Stripe", "Repo"]);
  expect(groundChips("nope", texts)).toEqual([]);
});

test("splitAround returns the text untouched when there is nothing to mark", () => {
  expect(splitAround("I built a Go CLI", "go cli")).toEqual(["I built a ", "Go CLI", ""]);
  expect(splitAround("abc", null)).toEqual(["abc", "", ""]);
  expect(splitAround("abc", "zzz")).toEqual(["abc", "", ""]);
});

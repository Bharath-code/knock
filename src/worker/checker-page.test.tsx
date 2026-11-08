import { expect, test } from "bun:test";
import { check } from "../shared/checker";
import { CheckerPage } from "./checker-page";

const draft = "Iam intersted in the role. 100 + stars";
const rewrite = "I am interested in the role. 100+ stars github.com/x Open to a call?";

test("before/after panel shows both scores, diff marks, swap button and name-free image link", async () => {
  const html = String(await CheckerPage({ draft, rules: check(draft), model: { fit: 4, tips: [], rewrite } }));
  expect(html).toContain("Before and after");
  expect(html).toContain("<del");
  expect(html).toContain("<ins");
  expect(html).toContain("data-use=\"draft\"");
  expect(html).toMatch(/\/og\/rewrite\.png\?b=\d&(amp;)?a=\d/);
  expect(html).not.toContain("Akash");
});

test("no panel when the model gave no rewrite", async () => {
  const html = String(await CheckerPage({ draft, rules: check(draft), model: { fit: 2, tips: ["add facts"], rewrite: "" } }));
  expect(html).not.toContain("Before and after");
});

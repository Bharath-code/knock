import { expect, test } from "bun:test";
import { ExamplePage, NewDoorPage } from "./door-pages";

test("example page shows a sample door, a sample knock and the next action", async () => {
  const html = String(await ExamplePage());
  expect(html).toContain("Sample, not a real person");
  expect(html).toContain("Sample knock");
  expect(html).toContain('href="/new"');
  expect(html).not.toContain("<script");
});

test("step 1 of make-a-door links to the example, step 2 does not", async () => {
  expect(String(await NewDoorPage({ owner: null }))).toContain('href="/example"');
  expect(String(await NewDoorPage({ owner: null, template: "referral" }))).not.toContain('href="/example"');
});

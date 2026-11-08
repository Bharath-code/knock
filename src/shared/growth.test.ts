import { expect, test } from "bun:test";
import { asRef, asTemplate, ownDoorPath, STARTER } from "./growth";
import { templates } from "./door";

test("own-door links carry a known source and only real templates", () => {
  expect(ownDoorPath("door", "beta")).toBe("/go/door?from=door&t=beta");
  expect(ownDoorPath("door", "profile")).toBe("/go/door?from=door");
  expect(ownDoorPath("status")).toBe("/go/door?from=status");
  expect([asRef("email"), asRef("evil"), asRef(undefined)]).toEqual(["email", null, null]);
  expect([asTemplate("gig"), asTemplate("<script>")]).toEqual(["gig", null]);
  for (const t of templates) expect(STARTER[t]).toContain("[");
});

import { describe, expect, test } from "bun:test";
import { asSource, emailKey, knockSchema } from "./knock";

test("emailKey ignores case, whitespace and +tags", () => {
  expect(emailKey(" Riya+jobs@Gmail.com ")).toBe("riya@gmail.com");
  expect(emailKey("riya@gmail.com")).toBe("riya@gmail.com");
});

describe("knockSchema", () => {
  const ok = { email: " Riya@X.com ", message: "Hi", answers: ["a", "b"], proof: "", consent: "on" };
  const s = knockSchema(2);
  test("accepts a valid knock and lowercases the email", () => {
    expect(s.parse(ok).email).toBe("riya@x.com");
  });
  test("needs consent, the right number of answers and a real email", () => {
    expect(s.safeParse({ ...ok, consent: undefined }).success).toBe(false);
    expect(s.safeParse({ ...ok, answers: ["a"] }).success).toBe(false);
    expect(s.safeParse({ ...ok, answers: ["a", " "] }).success).toBe(false);
    expect(s.safeParse({ ...ok, email: "nope" }).success).toBe(false);
  });
  test("proof is optional but must be an http(s) link", () => {
    expect(s.safeParse({ ...ok, proof: "https://github.com/x" }).success).toBe(true);
    expect(s.safeParse({ ...ok, proof: "javascript:alert(1)" }).success).toBe(false);
    expect(s.safeParse({ ...ok, proof: "not a link" }).success).toBe(false);
  });
});

test("source defaults to bio", () => {
  expect(asSource("reply")).toBe("reply");
  expect(asSource("evil")).toBe("bio");
  expect(asSource(undefined)).toBe("bio");
});

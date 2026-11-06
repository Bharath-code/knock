import { describe, expect, test } from "bun:test";
import { check, LENGTH_LIMIT } from "./checker";

const AKASH_ORIGINAL = `Hi Akash,
Iam intersted in the E5 backend role you posted.
I worked as an Forward deployed engineer. Worked from feature development and deploying the solution to the client.
Worked as an Frontend engineering developing enterprise product code security platform.
Developing dev tools like git-scope which has 100 + stars… many fullstack product written in node, typescript, ggolang…`;

const AKASH_REWRITE = `Hi Akash, re: Senior Backend (E5), Hyderabad.
- [N] yrs shipping backend services in Go + TypeScript; forward-deployed, design to production at enterprise clients
- Built git-scope (Go CLI, 100+ stars, 1k+ downloads)
1-page resume: [link] · GitHub: github.com/Bharath-code
Open to a 15-min call?`;

type Expected = { length: boolean; numbers: boolean; link: boolean; ask: boolean; typos: boolean };

const ALL_PASS: Expected = { length: true, numbers: true, link: true, ask: true, typos: true };

const fixtures: { name: string; draft: string; expect: Expected }[] = [
  {
    name: "original Akash DM",
    draft: AKASH_ORIGINAL,
    expect: { length: true, numbers: true, link: false, ask: false, typos: false },
  },
  { name: "rewritten Akash DM", draft: AKASH_REWRITE, expect: ALL_PASS },
  {
    name: "placeholder is not a link",
    draft: "Hi Riya, 6 yrs Go backend. Resume: [link]. Open to a 15-min call?",
    expect: { ...ALL_PASS, link: false },
  },
  {
    name: "short and strong",
    draft: "Built git-scope, 100+ stars: github.com/Bharath-code. Could you refer me?",
    expect: ALL_PASS,
  },
  {
    name: "one character over the limit",
    draft: `6 yrs backend. github.com/a. Open to a call? ${"x".repeat(LENGTH_LIMIT)}`.slice(0, LENGTH_LIMIT + 1),
    expect: { ...ALL_PASS, length: false },
  },
  {
    name: "exactly at the limit",
    draft: "6 yrs backend. github.com/a. Open to a call? ".padEnd(LENGTH_LIMIT - 1, "x") + "y",
    expect: ALL_PASS,
  },
  {
    name: "role level alone is not a number",
    draft: "Keen on the E5 role. See github.com/a. Open to a call?",
    expect: { ...ALL_PASS, numbers: false },
  },
  {
    name: "digits inside a link are not a number",
    draft: "Keen on the role. See github.com/user123. Open to a call?",
    expect: { ...ALL_PASS, numbers: false },
  },
  {
    name: "number glued to a unit counts",
    draft: "6yrs in Go. See github.com/a. Open to a call?",
    expect: ALL_PASS,
  },
  {
    name: "no link at all",
    draft: "6 years in Go. Open to a 15-min call?",
    expect: { ...ALL_PASS, link: false },
  },
  {
    name: "two links is too many",
    draft: "6 years in Go. https://a.dev and github.com/a. Open to a call?",
    expect: { ...ALL_PASS, link: false },
  },
  {
    name: "email address is not a link",
    draft: "6 years in Go. Reach me at me@example.com. Open to a call?",
    expect: { ...ALL_PASS, link: false },
  },
  {
    name: "tech names are not links",
    draft: "6 years with Node.js and Next.js. See https://a.dev. Open to a call?",
    expect: ALL_PASS,
  },
  {
    name: "question mark inside a link is not an ask",
    draft: "6 years in Go. See https://a.dev/x?ref=1.",
    expect: { ...ALL_PASS, ask: false },
  },
  {
    name: "polite ask without a question mark",
    draft: "6 years in Go. See a.dev. Please let me know if this fits.",
    expect: ALL_PASS,
  },
  {
    name: "interest alone is not an ask",
    draft: "I am interested in this role. 6 years in Go. See a.dev.",
    expect: { ...ALL_PASS, ask: false },
  },
  {
    name: "acronym IAM is not the typo Iam",
    draft: "6 years on AWS IAM. See a.dev. Open to a call?",
    expect: ALL_PASS,
  },
  {
    name: "an before a vowel sound or acronym is fine",
    draft: "An hour with an SRE and an engineer, 6 years in. See a.dev. Open to a call?",
    expect: ALL_PASS,
  },
  {
    name: "doubled word and stray space",
    draft: "I built the the API , 6 years in. See a.dev. Open to a call?",
    expect: { ...ALL_PASS, typos: false },
  },
  {
    name: "empty after trimming",
    draft: "   \n  ",
    expect: { length: false, numbers: false, link: false, ask: false, typos: true },
  },
];

describe("checker fixtures", () => {
  test("has 20 fixtures", () => expect(fixtures).toHaveLength(20));

  for (const { name, draft, expect: expected } of fixtures) {
    test(name, () => {
      const r = check(draft);
      expect({
        length: r.length.ok,
        numbers: r.numbers.ok,
        link: r.link.ok,
        ask: r.ask.ok,
        typos: r.typos.ok,
      }).toEqual(expected);
    });
  }
});

describe("checker details", () => {
  test("names every typo in the Akash DM", () => {
    const fixes = check(AKASH_ORIGINAL).typos.found.map((t) => t.fix);
    expect(fixes).toEqual(["I am", "interested", "golang", "a Forward", "a Frontend"]);
  });

  test("every failed check explains itself", () => {
    const r = check(AKASH_ORIGINAL);
    expect(r.link.hint).toBeTruthy();
    expect(r.ask.hint).toBeTruthy();
    expect(r.typos.hint).toBeTruthy();
    expect(r.numbers.hint).toBeUndefined();
  });

  test("repeat calls agree despite global regexes", () => {
    expect(check("See [link].").link.hint).toBe(check("See [link].").link.hint);
  });

  test("worst-case input stays well under 300 ms", () => {
    const hostile = "a.".repeat(5000);
    const start = performance.now();
    check(hostile);
    expect(performance.now() - start).toBeLessThan(300);
  });
});

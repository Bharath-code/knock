import { describe, expect, test } from "bun:test";
import { answerRate, createDoorSchema, pickTemplate, replyLine, slugify, type Template } from "./door";

const posts: [Template, string][] = [
  ["referral", "Hiring a Senior Backend Engineer (E5) in Hyderabad. Go experience needed. DM me."],
  ["referral", "My team is hiring two SDEs. Happy to refer strong candidates, send your resume."],
  ["referral", "We have an opening for a Product Designer at our Bangalore office. Apply via DM."],
  ["referral", "Looking to refer folks for data engineer roles at my company. Share your CV."],
  ["referral", "Our startup is hiring a founding frontend engineer. Join our team!"],
  ["referral", "I can refer for the SWE position at Stripe. DM your resume and a short note."],
  ["referral", "Open positions on the platform team, backend and SRE. Candidates with Go preferred."],
  ["referral", "Recruiting for a mobile engineer in Pune, referrals get a fast response."],
  ["referral", "Job alert: ML engineer opening at my org. Ping me with your resume."],
  ["referral", "Hiring! Customer success lead. Referral bonus if you know someone."],
  ["beta", "Launching my app next week. Looking for 20 beta testers, DM me for early access."],
  ["beta", "Need early users for our new note tool. Join the waitlist and give feedback."],
  ["beta", "Alpha is live. Want a few testers to try it out and break things."],
  ["beta", "Sharing invite codes for the private beta of our design tool. Feedback welcome."],
  ["beta", "Dogfooding our CLI preview, want early users to try it and tell me what hurts."],
  ["beta", "We just launched a Chrome extension and need testers on Windows. Feedback please."],
  ["beta", "Opening the waitlist for our AI notes app, first 50 get early access."],
  ["beta", "Looking for beta testers for my budgeting app on iOS. Share feedback in DMs."],
  ["beta", "Preview build ready. Need five people to test onboarding and send feedback."],
  ["beta", "Early access invites going out tonight. Reply if you want to try it."],
  ["gig", "Need a freelance designer for a 2-week landing page project. Paid, budget is fixed."],
  ["gig", "Looking for a contractor to build a Shopify theme. Hourly rate, send a quote."],
  ["gig", "One-off gig: illustrator needed for 6 book covers. Share your rates."],
  ["gig", "Hiring a freelancer to edit a podcast. Short engagement, paid per episode."],
  ["gig", "Agency looking for a copywriter on contract. Send samples and your rate."],
  ["gig", "Need someone to commission a logo for my cafe. Budget 20k INR."],
  ["gig", "Freelance video editor wanted for a monthly project. Paid, rates negotiable."],
  ["gig", "Small project: migrate a WordPress blog. Contractor, hourly, quote please."],
  ["gig", "Looking for a freelance writer for a short engagement on fintech explainers."],
  ["gig", "Need an editor for a one-off project, 30 pages, paid, quote in DM."],
];

describe("pickTemplate", () => {
  test("picks the right template on at least 90% of 30 sample posts", () => {
    const wrong = posts.filter(([want, post]) => pickTemplate(post) !== want);
    expect(1 - wrong.length / posts.length).toBeGreaterThanOrEqual(0.9);
  });

  test("falls back to referral with no signal", () => {
    expect(pickTemplate("hello there")).toBe("referral");
  });
});

describe("slugify", () => {
  test("is readable, short and url-safe", () => {
    expect(slugify("Hiring a Senior Backend Engineer (E5) in Hyderabad!")).toBe("hiring-a-senior-backend-engineer-e5");
    expect(slugify("!!!")).toBe("door");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

test("reply line carries the link", () => {
  expect(replyLine("https://x.dev/d/a")).toBe("DM me, or knock here for a guaranteed answer: https://x.dev/d/a");
});

describe("createDoorSchema", () => {
  const ok = { handle: "@Akash_1", template: "gig", fields: ["a"], window: "14" };
  test("normalizes handle and window", () => {
    const r = createDoorSchema.parse(ok);
    expect(r.handle).toBe("akash_1");
    expect(r.window).toBe(14);
  });
  test("rejects bad windows, handles and field counts", () => {
    expect(createDoorSchema.safeParse({ ...ok, window: "5" }).success).toBe(false);
    expect(createDoorSchema.safeParse({ ...ok, handle: "a b" }).success).toBe(false);
    expect(createDoorSchema.safeParse({ ...ok, fields: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

test("answer rate shows only from 5 knocks", () => {
  expect(answerRate(4, 4)).toBeNull();
  expect(answerRate(5, 4)).toBe(80);
});

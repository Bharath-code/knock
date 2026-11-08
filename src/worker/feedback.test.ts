import { expect, test } from "bun:test";
import { fakeDb } from "./testdb";
import { cleanPage, feedbackSchema, listFeedback, markReviewed, saveFeedback } from "./feedback";
import { sendReceipt } from "./email";

test("feedback is stored with its tag, listed unreviewed first, and cleared by review", async () => {
  const { db } = await fakeDb();
  await saveFeedback(db, feedbackSchema.parse({ tag: "bug", body: "Inbox is blank", page: "/app" }), null, 1);
  await saveFeedback(db, feedbackSchema.parse({ tag: "request", body: "Dark mode", contact: "a@b.co" }), null, 2);
  let rows = await listFeedback(db);
  expect(rows.map((r) => r.tag)).toEqual(["request", "bug"]);
  expect(rows[1]!.page).toBe("/app");
  expect(await markReviewed(db, 3)).toBe(2);
  await saveFeedback(db, feedbackSchema.parse({ tag: "confusion", body: "What is a knock?" }), null, 4);
  rows = await listFeedback(db);
  expect(rows[0]!.tag).toBe("confusion");
  expect(rows[1]!.reviewed_at).toBe(3);
});

test("rejects unknown tags and empty bodies, and only keeps same-site paths", () => {
  expect(feedbackSchema.safeParse({ tag: "praise", body: "x" }).success).toBe(false);
  expect(feedbackSchema.safeParse({ tag: "bug", body: "   " }).success).toBe(false);
  expect(cleanPage("/app/settings")).toBe("/app/settings");
  expect(cleanPage("https://evil.example")).toBe("");
  expect(cleanPage("//evil.example")).toBe("");
});

test("emails end with the founder link", async () => {
  let body = "";
  await sendReceipt({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.co", PUBLIC_ORIGIN: "https://doorbell.test" }, { to: "x@y.co", link: "https://l", who: "A", days: 7 }, (async (_u: unknown, i: { body: string }) => {
    body = i.body;
    return new Response("{}");
  }) as unknown as typeof fetch);
  expect(JSON.parse(body).text).toContain("https://doorbell.test/feedback?from=email");
});

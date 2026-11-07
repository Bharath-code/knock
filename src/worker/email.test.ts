import { expect, test } from "bun:test";
import { sendReceipt, sendYes } from "./email";

const r = { to: "a@x.com", link: "https://d.dev/k/abc", who: "Akash", days: 7 };
const reply = (status: number, seen: { body?: string }) =>
  (async (_: unknown, init?: RequestInit) => {
    seen.body = init?.body as string;
    return new Response("{}", { status });
  }) as unknown as typeof fetch;

test("does nothing without a key and sender", async () => {
  expect(await sendReceipt({}, r)).toBe("unconfigured");
  expect(await sendReceipt({ RESEND_API_KEY: "k" }, r)).toBe("unconfigured");
});

test("sends the status link, and throws on a provider error so the queue retries", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  expect(await sendReceipt(env, r, reply(200, seen))).toBe("sent");
  expect(JSON.parse(seen.body!)).toMatchObject({ to: "a@x.com", text: expect.stringContaining("https://d.dev/k/abc") });
  expect(sendReceipt(env, r, reply(500, {}))).rejects.toThrow("email provider 500");
});

test("yes email carries the note and the booking link, and works without a link", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  await sendYes(env, { to: "a@x.com", who: "Akash", url: "https://cal.com/akash/15", note: "Happy to chat" }, reply(200, seen));
  expect(JSON.parse(seen.body!).text).toBe("Akash said yes to your knock.\n\nHappy to chat\n\nPick a time that works: https://cal.com/akash/15");
  await sendYes(env, { to: "a@x.com", who: "Akash", url: null, note: null }, reply(200, seen));
  expect(JSON.parse(seen.body!).text).toBe("Akash said yes to your knock.");
});

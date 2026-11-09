import { expect, test } from "bun:test";
import { sendPass, sendClosure, sendDigest, sendNewSignIn, sendReceipt, sendSignIn, sendYes, stripLinks } from "./email";

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

test("yes email strips links from the note and newlines from the name", async () => {
  expect(stripLinks("Call me: https://evil.co/x or www.evil.co or evil.co/pay\nthanks")).toBe("Call me: [link removed] or [link removed] or [link removed] thanks");
  expect(stripLinks("Happy to chat")).toBe("Happy to chat");
  const gone = (s: string) => expect(stripLinks(s)).toBe("[link removed]");
  [
    "ftp://evil.co/x", "chrome-extension://abcdef/p", "javascript:alert(1)", "mailto:a@evil.co", "1.2.3.4", "10.0.0.1:8080/pay",
    "evil。co", "evil｡co/pay", "ｅｖｉｌ．ｃｏ", "ｈｔｔｐｓ：／／ｅｖｉｌ．ｃｏ", "例え.jp", "пример.рф/pay", "bücher.de",
  ].forEach(gone);
  expect(stripLinks("Call 1.2.3 or v2.0, thanks!")).toBe("Call 1.2.3 or v2.0, thanks!");
  const seen: { body?: string } = {};
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  await sendYes(env, { to: "a@x.com", who: "Akash\nPay at evil.co", url: "https://cal.com/a/15", note: "see https://evil.co" }, reply(200, seen));
  const b = JSON.parse(seen.body!);
  expect(b.subject).toBe("Akash Pay at [link removed] said yes");
  expect(b.text).toBe("Akash Pay at [link removed] said yes to your knock.\n\nsee [link removed]\n\nPick a time that works: https://cal.com/a/15");
});

test("yes email carries the invite code before the booking link", async () => {
  const seen: { body?: string } = {};
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  await sendYes(env, { to: "a@x.com", who: "Akash", url: "https://cal.com/a/15", note: null, code: "BETA-1234" }, reply(200, seen));
  expect(JSON.parse(seen.body!).text).toBe("Akash said yes to your knock.\n\nYour invite code: BETA-1234\n\nPick a time that works: https://cal.com/a/15");
});

test("closure email uses the kind message, a distinct subject for Not now, and strips links", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Thanks. See https://evil.co" }, reply(200, seen));
  expect(JSON.parse(seen.body!)).toMatchObject({ subject: "Akash closed your knock", text: "Thanks. See [link removed]\n\n(Akash answered through Doorbell.)" });
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Later", later: true }, reply(200, seen));
  expect(JSON.parse(seen.body!).subject).toBe("Akash replied to your knock");
});

test("expired closure email has its own subject and no 'answered' footer", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Akash didn't get to your knock.", expired: true }, reply(200, seen));
  expect(JSON.parse(seen.body!)).toMatchObject({ subject: "Akash didn't get to your knock", text: "Akash didn't get to your knock." });
});

test("sign-in email carries the link and says when it expires; a claim names the door", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  await sendSignIn(env, { to: "a@x.com", link: "https://d.dev/signin/confirm?t=abc" }, reply(200, seen));
  expect(JSON.parse(seen.body!)).toMatchObject({ subject: "Your Doorbell sign-in link", text: expect.stringContaining("https://d.dev/signin/confirm?t=abc") });
  expect(JSON.parse(seen.body!).text).toContain("15 minutes");
  await sendSignIn(env, { to: "a@x.com", link: "https://d.dev/x", handle: "akash" }, reply(200, seen));
  expect(JSON.parse(seen.body!).subject).toBe("Confirm your email for @akash");
  expect(sendSignIn(env, { to: "a@x.com", link: "l" }, reply(500, {}))).rejects.toThrow("email provider 500");
  expect(await sendSignIn({}, { to: "a@x.com", link: "l" })).toBe("unconfigured");
});

test("new-sign-in alert names the device and time and points to sign out everywhere", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  await sendNewSignIn(env, { to: "a@x.com", device: "Safari on iOS", when: "2026-11-08 10:00 UTC", link: "https://d.dev/app" }, reply(200, seen));
  const b = JSON.parse(seen.body!);
  expect(b.subject).toBe("New sign-in to your Doorbell account");
  expect(b.text).toContain("Safari on iOS");
  expect(b.text).toContain("2026-11-08 10:00 UTC");
  expect(b.text).toContain("Sign out everywhere");
  expect(await sendNewSignIn({}, { to: "a@x.com", device: "d", when: "w", link: "l" })).toBe("unconfigured");
});

test("sender emails end with the own-door link only when the public origin is set", async () => {
  const seen: { body?: string } = {};
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>", PUBLIC_ORIGIN: "https://d.dev" };
  const tail = "Get every request answered on your own posts: https://d.dev/go/door?from=email";
  await sendReceipt(env, r, reply(200, seen));
  expect(JSON.parse(seen.body!).text.endsWith(tail)).toBe(true);
  await sendYes(env, { to: "a@x.com", who: "Akash", url: null, note: null }, reply(200, seen));
  expect(JSON.parse(seen.body!).text).toBe(`Akash said yes to your knock.\n\nQuestion or problem? Talk to Bharath, I reply within 24 hours: https://d.dev/feedback?from=email\n\n—\n${tail}`);
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Not this time." }, reply(200, seen));
  expect(JSON.parse(seen.body!).text.endsWith(tail)).toBe(true);
  await sendReceipt({ ...env, PUBLIC_ORIGIN: undefined }, r, reply(200, seen));
  expect(JSON.parse(seen.body!).text).not.toContain("/go/door");
  const id = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "No.", k: id }, reply(200, seen));
  expect(JSON.parse(seen.body!).text.endsWith(`${tail}&k=${id}`)).toBe(true);
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "No.", k: "bad id&x=1" }, reply(200, seen));
  expect(JSON.parse(seen.body!).text.endsWith(tail)).toBe(true);
});

test("html bodies sit beside the text, with links stripped, dark mode and the footer links", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>", PUBLIC_ORIGIN: "https://d.dev" };
  const seen: { body?: string } = {};
  const html = () => JSON.parse(seen.body!).html as string;
  await sendReceipt(env, r, reply(200, seen));
  expect(html()).toContain("https://d.dev/k/abc");
  expect(html()).toContain("prefers-color-scheme:dark");
  expect(html()).toContain('content="light dark"');
  expect(html()).toContain("https://d.dev/feedback?from=email");
  expect(html()).toContain("https://d.dev/go/door?from=email");
  await sendYes(env, { to: "a@x.com", who: "Akash\nPay at evil.co", url: "https://cal.com/a/15", note: "see https://evil.co", code: "BETA-1234" }, reply(200, seen));
  expect(html()).toContain("Akash Pay at [link removed] said yes");
  expect(html()).toContain("see [link removed]");
  expect(html()).toContain("BETA-1234");
  expect(html()).toContain("https://cal.com/a/15");
  expect(html()).not.toContain("evil.co");
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Thanks. See https://evil.co", later: true, again: Date.UTC(2026, 11, 1) }, reply(200, seen));
  expect(html()).toContain("Thanks. See [link removed]");
  expect(html()).toContain("2026-12-01");
  expect(html()).not.toContain("evil.co");
  await sendClosure(env, { to: "a@x.com", who: "Akash", message: "Akash didn't get to your knock.", expired: true }, reply(200, seen));
  expect(html()).not.toContain("answered through Doorbell");
  await sendReceipt({ ...env, PUBLIC_ORIGIN: undefined }, r, reply(200, seen));
  expect(html()).not.toContain("Talk to Bharath");
});

test("digest html keeps the unsubscribe link and header, strips links, and keeps the text", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  const d = { to: "a@x.com", fresh: 2, open: 3, top: [{ door: "Akash", fit: 4, excerpt: "see evil.co/pay" }, { door: "Bo", fit: null, excerpt: "hi" }], inbox: "https://d.dev/app", unsubscribe: "https://d.dev/u/tok" };
  await sendDigest(env, d, reply(200, seen));
  const b = JSON.parse(seen.body!);
  expect(b.html).toContain("https://d.dev/u/tok");
  expect(b.html).toContain("https://d.dev/app");
  expect(b.html).toContain("fit 4/5");
  expect(b.html).toContain("not scored");
  expect(b.html).toContain("see [link removed]");
  expect(b.html).not.toContain("evil.co");
  expect(b.headers["List-Unsubscribe"]).toBe("<https://d.dev/u/tok>");
  expect(b.text).toContain("Turn it off: https://d.dev/u/tok");
});

test("pass email names who passed, strips links from the note and carries the confirm link", async () => {
  const env = { RESEND_API_KEY: "k", EMAIL_FROM: "Doorbell <hi@d.dev>" };
  const seen: { body?: string } = {};
  expect(await sendPass(env, { to: "a@x.com", by: "Riya", toName: "Arjun", note: "try https://evil.example now", link: "https://d.dev/p/abc" }, reply(200, seen))).toBe("sent");
  const b = JSON.parse(seen.body!);
  expect(b.subject).toBe("Riya passed you to Arjun's door");
  expect(b.text).toContain("https://d.dev/p/abc");
  expect(b.text).toContain("[link removed]");
  expect(b.text).not.toContain("evil.example");
  expect(b.html).toContain("Review and send");
});

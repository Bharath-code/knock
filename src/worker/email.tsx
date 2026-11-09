import { render } from "@react-email/render";
import { ownDoorPath } from "../shared/growth";
import { Closure as ClosureEmail } from "./emails/Closure";
import { Digest as DigestEmail } from "./emails/Digest";
import { Receipt as ReceiptEmail } from "./emails/Receipt";
import { Yes as YesEmail } from "./emails/Yes";

// k: the knock the email is about, carried into the own-door link for attribution. Optional so queued jobs still send.
export type Receipt = { to: string; link: string; who: string; days: number; k?: string };
export type Closure = { to: string; message: string; who: string; later?: boolean; expired?: boolean; k?: string; again?: number };
export type MailEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string; PUBLIC_ORIGIN?: string };

// Sender emails end with the own-door link; skipped when the public origin isn't configured.
const ownDoor = (env: MailEnv, k?: string) => (env.PUBLIC_ORIGIN ? `\n\n—\nGet every request answered on your own posts: ${new URL(ownDoorPath("email", null, k), env.PUBLIC_ORIGIN).href}` : "");

// Every email that isn't a security notice ends with the direct line to the founder.
const talk = (env: MailEnv) => (env.PUBLIC_ORIGIN ? `\n\nQuestion or problem? Talk to Bharath, I reply within 24 hours: ${new URL("/feedback?from=email", env.PUBLIC_ORIGIN).href}` : "");

const links = (env: MailEnv, k?: string, own = true) => ({
  talk: env.PUBLIC_ORIGIN ? new URL("/feedback?from=email", env.PUBLIC_ORIGIN).href : undefined,
  ownDoor: own && env.PUBLIC_ORIGIN ? new URL(ownDoorPath("email", null, k), env.PUBLIC_ORIGIN).href : undefined,
});

// ponytail: Resend over plain fetch; swap this one function for another provider
export const sendReceipt = async (env: MailEnv, r: Receipt, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: r.to,
      subject: `Your knock reached ${r.who}`,
      html: await render(<ReceiptEmail who={stripLinks(r.who)} days={r.days} link={r.link} {...links(env, r.k)} />),
      text: `Your knock was delivered to ${r.who}.\n\nThey have promised an answer within ${r.days} days. Follow it here:\n${r.link}\n\nKeep this link private. Anyone with it can see the status.${talk(env)}${ownDoor(env, r.k)}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export const sendClosure = async (env: MailEnv, r: Closure, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const who = stripLinks(r.who);
  const message = stripLinks(r.message);
  const again = r.later && r.again ? new Date(r.again).toISOString().slice(0, 10) : undefined;
  const html = await render(<ClosureEmail who={who} message={message} later={r.later} expired={r.expired} again={again} {...links(env, r.k)} />);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, html, subject: r.expired ? `${who} didn't get to your knock` : r.later ? `${who} replied to your knock` : `${who} closed your knock`, text: (r.expired ? stripLinks(r.message) : `${stripLinks(r.message)}\n\n(${who} answered through Doorbell.)`) + (r.later && r.again ? `\n\nYou can knock again from ${new Date(r.again).toISOString().slice(0, 10)}. We'll email you then.` : "") + talk(env) + ownDoor(env, r.k) }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Yes = { to: string; who: string; url: string | null; note: string | null; code?: string | null; k?: string };

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
// ponytail: regex, so a bare "Node.js" is also masked; the booking link is the only link channel in a Yes
const LINK =
  /(?<![\p{L}\p{N}_-])[a-z][a-z0-9+.-]*:\/\/\S+|(?<![\p{L}\p{N}_-])(?:mailto|javascript|data|tel):\S+|(?<![\p{L}\p{N}_-])www\.\S+|(?<!\d)\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/\S*)?|(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.\p{L}{2,}(?:\/\S*)?/giu;
// NFKC folds fullwidth dots and letters; the ideographic stops are not folded, so map them too.
export const stripLinks = (s: string) => oneLine(s.normalize("NFKC").replace(/[。｡]/g, ".").replace(LINK, "[link removed]"));

export const sendYes = async (env: MailEnv, raw: Yes, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const r = { ...raw, who: stripLinks(raw.who), note: raw.note && stripLinks(raw.note) };
  const parts = [`${r.who} said yes to your knock.`, r.note, r.code && `Your invite code: ${r.code}`, r.url && `Pick a time that works: ${r.url}`].filter(Boolean);
  const html = await render(<YesEmail who={r.who} note={r.note} code={r.code} url={r.url} {...links(env, r.k)} />);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, html, subject: `${r.who} said yes`, text: parts.join("\n\n") + talk(env) + ownDoor(env, r.k) }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Reminder = { to: string; who: string; link: string };

export const sendReminder = async (env: MailEnv, raw: Reminder, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const who = stripLinks(raw.who);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: raw.to,
      subject: `You can knock again on ${who}'s door`,
      text: `When ${who} answered your knock with "not now", they said you could try again later. That time has come:\n${raw.link}\n\nThis is the only reminder we'll send.${talk(env)}${ownDoor(env)}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Checkin = { to: string; side: "sender" | "receiver"; who: string; link: string; about?: string };

export const sendCheckin = async (env: MailEnv, raw: Checkin, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const who = stripLinks(raw.who);
  const sender = raw.side === "sender";
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: raw.to,
      subject: sender ? `Did it happen with ${who}?` : "Did that Yes lead anywhere?",
      text: `${sender ? `A week ago ${who} said yes to your knock` : "A week ago you said yes to a knock"}${raw.about ? ` on ${stripLinks(raw.about)}` : ""}. Did it happen? It takes one tap:\n${raw.link}\n\nThis is the only check-in we'll send for this knock.${talk(env)}${sender ? ownDoor(env) : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Seen = { to: string; who: string; off: string; k?: string };

export const sendSeen = async (env: MailEnv, raw: Seen, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const who = stripLinks(raw.who);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: raw.to,
      subject: `${who} saw your knock`,
      text: `${who} just opened your knock. They promised an answer, and you'll get an email as soon as they reply.\n\nYou get this once per knock. Turn it off: ${raw.off}${talk(env)}${ownDoor(env, raw.k)}`,
      headers: { "List-Unsubscribe": `<${raw.off}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type SignIn ={ to: string; link: string; handle?: string | null };

export const sendSignIn = async (env: MailEnv, r: SignIn, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const what = r.handle ? `Confirm this email for your door @${r.handle}` : "Sign in to Doorbell";
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: r.to,
      subject: r.handle ? `Confirm your email for @${r.handle}` : "Your Doorbell sign-in link",
      text: `${what}:\n${r.link}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this email.${talk(env)}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type NewSignIn = { to: string; device: string; when: string; link: string };

export const sendNewSignIn = async (env: MailEnv, r: NewSignIn, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: r.to,
      subject: "New sign-in to your Doorbell account",
      text: `Your Doorbell account was just signed in on a new device.\n\nDevice: ${r.device}\nTime: ${r.when}\n\nIf this was you, no action is needed. If not, open your inbox and choose "Sign out everywhere":\n${r.link}${talk(env)}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Digest = { to: string; fresh: number; open: number; top: { door: string; fit: number | null; excerpt: string }[]; inbox: string; unsubscribe: string };

export const sendDigest = async (env: MailEnv, r: Digest, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;
  const summary = `${n(r.fresh, "new knock")} since your last digest. ${n(r.open, "knock")} waiting in total.`;
  const top = r.top.map((t) => `- ${t.door}, ${t.fit == null ? "not scored" : `fit ${t.fit}/5`}: ${stripLinks(t.excerpt)}`);
  const text = [
    summary,
    top.length ? `Best fits:\n${top.join("\n")}` : null,
    `Answer them: ${r.inbox}`,
    `You get this at most once a day, only when there are new knocks.\nTurn it off: ${r.unsubscribe}`,
  ].filter(Boolean).join("\n\n") + talk(env);
  const html = await render(<DigestEmail summary={summary} top={r.top.map((t) => ({ ...t, door: stripLinks(t.door), excerpt: stripLinks(t.excerpt) }))} inbox={r.inbox} unsubscribe={r.unsubscribe} talk={links(env).talk} />);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: r.to,
      html,
      subject: `${n(r.fresh, "new knock")} on your door`,
      text,
      headers: { "List-Unsubscribe": `<${r.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

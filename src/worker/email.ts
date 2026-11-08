export type Receipt = { to: string; link: string; who: string; days: number };
export type Closure = { to: string; message: string; who: string; later?: boolean; expired?: boolean };
export type MailEnv = { RESEND_API_KEY?: string; EMAIL_FROM?: string };

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
      text: `Your knock was delivered to ${r.who}.\n\nThey have promised an answer within ${r.days} days. Follow it here:\n${r.link}\n\nKeep this link private. Anyone with it can see the status.`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export const sendClosure = async (env: MailEnv, r: Closure, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const who = stripLinks(r.who);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, subject: r.expired ? `${who} didn't get to your knock` : r.later ? `${who} replied to your knock` : `${who} closed your knock`, text: r.expired ? stripLinks(r.message) : `${stripLinks(r.message)}\n\n(${who} answered through Doorbell.)` }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Yes = { to: string; who: string; url: string | null; note: string | null; code?: string | null };

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
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, subject: `${r.who} said yes`, text: parts.join("\n\n") }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type SignIn = { to: string; link: string; handle?: string | null };

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
      text: `${what}:\n${r.link}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
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
      text: `Your Doorbell account was just signed in on a new device.\n\nDevice: ${r.device}\nTime: ${r.when}\n\nIf this was you, no action is needed. If not, open your inbox and choose "Sign out everywhere":\n${r.link}`,
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Digest = { to: string; fresh: number; open: number; top: { door: string; fit: number | null; excerpt: string }[]; inbox: string; unsubscribe: string };

export const sendDigest = async (env: MailEnv, r: Digest, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const n = (k: number, one: string) => `${k} ${k === 1 ? one : `${one}s`}`;
  const top = r.top.map((t) => `- ${t.door}, ${t.fit == null ? "not scored" : `fit ${t.fit}/5`}: ${stripLinks(t.excerpt)}`);
  const text = [
    `${n(r.fresh, "new knock")} since your last digest. ${n(r.open, "knock")} waiting in total.`,
    top.length ? `Best fits:\n${top.join("\n")}` : null,
    `Answer them: ${r.inbox}`,
    `You get this at most once a day, only when there are new knocks.\nTurn it off: ${r.unsubscribe}`,
  ].filter(Boolean).join("\n\n");
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: r.to,
      subject: `${n(r.fresh, "new knock")} on your door`,
      text,
      headers: { "List-Unsubscribe": `<${r.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

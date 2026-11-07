export type Receipt = { to: string; link: string; who: string; days: number };
export type Closure = { to: string; message: string; who: string };
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
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, subject: `${r.who} closed your knock`, text: `${r.message}\n\n(${r.who} answered through Doorbell.)` }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

export type Yes = { to: string; who: string; url: string | null; note: string | null };

export const sendYes = async (env: MailEnv, r: Yes, fetcher: typeof fetch = fetch): Promise<"sent" | "unconfigured"> => {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return "unconfigured";
  const parts = [`${r.who} said yes to your knock.`, r.note, r.url && `Pick a time that works: ${r.url}`].filter(Boolean);
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: r.to, subject: `${r.who} said yes`, text: parts.join("\n\n") }),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}`);
  return "sent";
};

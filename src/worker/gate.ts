export const CHECKS_PER_HOUR = 20;
const HOUR_MS = 3_600_000;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type Gate = "ok" | "captcha" | "limited" | "unconfigured";

export const verifyTurnstile = async (
  secret: string,
  token: string,
  ip: string,
  fetcher: typeof fetch = fetch,
) => {
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", ip);
  try {
    const res = await fetcher(SITEVERIFY, { method: "POST", body });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
};

// ponytail: fixed hourly window in D1, so a burst across an hour boundary can double; use a Durable Object if that matters
export const withinLimit = async (db: D1Database, key: string, now = Date.now()) => {
  const row = await db
    .prepare(
      "INSERT INTO rate_limits (key, window, n) VALUES (?1, ?2, 1) ON CONFLICT (key, window) DO UPDATE SET n = n + 1 RETURNING n",
    )
    .bind(key, Math.floor(now / HOUR_MS))
    .first<{ n: number }>();
  return (row?.n ?? 1) <= CHECKS_PER_HOUR;
};

export const pruneLimits = (db: D1Database, now = Date.now()) =>
  db.prepare("DELETE FROM rate_limits WHERE window < ?1").bind(Math.floor(now / HOUR_MS) - 24).run();

// Fails closed: with no secret the paid model route stays shut.
export const gate = async (
  env: { DB: D1Database; TURNSTILE_SECRET?: string },
  ip: string,
  token: string,
): Promise<Gate> => {
  if (!env.TURNSTILE_SECRET) return "unconfigured";
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip))) return "captcha";
  return (await withinLimit(env.DB, `check:${ip}`)) ? "ok" : "limited";
};

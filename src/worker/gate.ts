export const CHECKS_PER_HOUR = 20;
const HOUR_MS = 3_600_000;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type Gate = "ok" | "captcha" | "limited" | "unconfigured";

export const verifyTurnstile = async (
  secret: string,
  token: string,
  ip: string,
  hostnames: string[],
  action: string,
  fetcher: typeof fetch = fetch,
) => {
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", ip);
  try {
    const res = await fetcher(SITEVERIFY, { method: "POST", body });
    const out = (await res.json()) as { success?: boolean; action?: string; hostname?: string };
    return out.success === true && out.action === action && hostnames.includes(out.hostname ?? "");
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

// An IPv6 user usually controls a whole /64, so key on that prefix; IPv4-mapped addresses count as IPv4.
export const ipKey = (ip: string) => {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
};

// Fails closed: with no secret the paid model route stays shut.
export const gate = async (
  env: { DB: D1Database; TURNSTILE_SECRET?: string; TURNSTILE_HOSTNAMES?: string },
  ip: string,
  token: string,
  action = "check",
): Promise<Gate> => {
  const hostnames = (env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!env.TURNSTILE_SECRET || hostnames.length === 0) return "unconfigured";
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, token, ip, hostnames, action))) return "captcha";
  return (await withinLimit(env.DB, `${action}:${ipKey(ip)}`)) ? "ok" : "limited";
};

import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { check as checkDraft } from "../shared/checker";
import { createDoorSchema, defaultFields, pickTemplate, PROFILE_SLUG, handleSchema } from "../shared/door";
import { checkRequestSchema, tables, type Health } from "../shared/schema";
import { Door } from "./door";
import { CheckerPage } from "./checker-page";
import { DoorPage, NewDoorPage, NotFoundDoor } from "./door-pages";
import { ogPng } from "./og";
import { createDoor, getDoor, ownerFromToken } from "./doors";
import { gate, pruneLimits } from "./gate";
import { Home } from "./home";
import { scoreDraft, type ModelResult } from "./model";

export { Door };

const validBody = validator("json", (value, c) => {
  const parsed = checkRequestSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : c.json({ error: "Send a post and a draft of up to 10,000 characters." }, 400);
});

type Secrets = Env & { ANTHROPIC_API_KEY?: string; TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_HOSTNAMES?: string };
type AppEnv = { Bindings: Secrets };

const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? "unknown";

const runModel = async (env: Secrets, input: { post: string; draft: string }): Promise<ModelResult | null> => {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 8_000 });
  return scoreDraft(client, input);
};

const gateMessage = {
  captcha: "We couldn't confirm you're human. Please try again.",
  limited: "That's 20 tries this hour from your network. Try again a bit later.",
  unconfigured: "Checks aren't set up yet.",
} as const;

const api = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ status: "ok" } satisfies Health))
  .post("/check", validBody, (c) => c.json(checkDraft(c.req.valid("json").draft)))
  .post("/check/model", validBody, async (c) => {
    const g = await gate(c.env, clientIp(c.req.raw), c.req.header("x-turnstile-token") ?? "");
    if (g !== "ok") return c.json({ error: gateMessage[g] }, g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    const result = await runModel(c.env, c.req.valid("json"));
    return result?.ok
      ? c.json(result.check)
      : c.json({ error: "Suggestions didn't load this time. Your checks above still work." }, 503);
  });

export type Api = typeof api;

const sameToken = (a: string, b: string) => {
  const enc = new TextEncoder();
  const [x, y] = [enc.encode(a), enc.encode(b)];
  // ponytail: the DOM lib hides this Workers-only method; split worker and app tsconfigs if casts pile up
  const subtle = crypto.subtle as unknown as { timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean };
  return x.byteLength === y.byteLength && subtle.timingSafeEqual(x, y);
};

const check = async (fn: () => Promise<unknown>) => {
  try {
    return (await fn()) === false ? "failed" : "ok";
  } catch (e) {
    return e instanceof Error ? e.message : "failed";
  }
};

const app = new Hono<AppEnv>()
  .route("/api", api)
  .get("/api/smoke", async (c) => {
    const token = c.env.SMOKE_TOKEN;
    if (!token || !sameToken(c.req.header("x-smoke-token") ?? "", token)) return c.notFound();

    const results = {
      d1: await check(async () => {
        const { results } = await c.env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        ).all<{ name: string }>();
        const found = new Set(results.map((r) => r.name));
        return tables.every((t) => found.has(t));
      }),
      durableObject: await check(() => c.env.DOOR.getByName("__smoke").ping()),
      r2: await check(async () => {
        await c.env.UPLOADS.put("__smoke", "ok");
        const body = await (await c.env.UPLOADS.get("__smoke"))?.text();
        await c.env.UPLOADS.delete("__smoke");
        return body === "ok";
      }),
      queue: await check(() => c.env.JOBS.send({ type: "smoke" })),
      analytics: await check(async () => {
        c.env.FUNNEL.writeDataPoint({ blobs: ["smoke"], indexes: ["smoke"] });
      }),
    };
    return c.json(results, Object.values(results).every((r) => r === "ok") ? 200 : 500);
  })
  .get("/", (c) => c.html(Home()))
  .get("/check", (c) => c.html(CheckerPage({ siteKey: c.env.TURNSTILE_SITE_KEY })))
  .post("/check", async (c) => {
    const form = await c.req.parseBody();
    const text = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const siteKey = c.env.TURNSTILE_SITE_KEY;
    const parsed = checkRequestSchema.safeParse({ post: text("post"), draft: text("draft") });
    const kept = { post: text("post").slice(0, 10_000), draft: text("draft").slice(0, 10_000), siteKey };
    if (!parsed.success) {
      return c.html(CheckerPage({ ...kept, error: "Add your DM, up to 10,000 characters." }), 400);
    }
    const g = await gate(c.env, clientIp(c.req.raw), text("cf-turnstile-response"));
    if (g !== "ok") {
      return c.html(CheckerPage({ ...kept, error: gateMessage[g] }), g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    }
    const result = await runModel(c.env, parsed.data);
    return c.html(
      CheckerPage({ ...kept, rules: checkDraft(parsed.data.draft), model: result?.ok ? result.check : "unavailable" }),
    );
  })
  .get("/new", async (c) => c.html(NewDoorPage({ owner: await ownerFromToken(c.env.DB, getCookie(c, "ds")), siteKey: c.env.TURNSTILE_SITE_KEY })))
  .post("/new", async (c) => {
    const form = await c.req.parseBody({ all: true });
    const one = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const many = (k: string) => [form[k] ?? []].flat().filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    const token = getCookie(c, "ds");
    const owner = await ownerFromToken(c.env.DB, token);
    const post = one("post").slice(0, 10_000);
    const handleIn = owner?.handle ?? one("handle");
    const base = { owner, siteKey: c.env.TURNSTILE_SITE_KEY, post, handle: handleIn, name: one("name") };
    const bad = (error: string, extra = {}) => c.html(NewDoorPage({ ...base, ...extra, error }), 400);
    if (!handleSchema.safeParse(handleIn).success) return bad("Handles use 3 to 20 letters, numbers or underscores.");
    const mode = post === "" ? "claim" : one("step") === "create" ? "create" : "analyze";
    if (mode === "analyze") {
      const template = pickTemplate(post);
      return c.html(NewDoorPage({ ...base, template, fields: defaultFields[template] }));
    }
    const parsed = createDoorSchema.safeParse({
      handle: handleIn,
      name: base.name,
      post,
      template: one("template") || "referral",
      fields: mode === "claim" ? ["-"] : many("field"),
      window: one("window") || "7",
    });
    if (!parsed.success) {
      return bad("Check the questions (1 to 3) and the answer window.", { template: pickTemplate(post), fields: many("field") });
    }
    const g = await gate(c.env, clientIp(c.req.raw), one("cf-turnstile-response"), "new");
    if (g !== "ok") {
      const again = mode === "claim" ? {} : { template: parsed.data.template, fields: parsed.data.fields, window: parsed.data.window };
      return c.html(NewDoorPage({ ...base, ...again, error: gateMessage[g] }), g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    }
    const made = await createDoor(c.env.DB, parsed.data, token);
    if (!made.ok) return bad(made.error);
    if (made.token) setCookie(c, "ds", made.token, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: 31_536_000 });
    return c.redirect(made.slug === PROFILE_SLUG ? `/d/${made.handle}?made=1` : `/d/${made.handle}/${made.slug}?made=1`, 303);
  })
  .get("/d/:handle/:slug/og.png", async (c) => {
    const door = await getDoor(c.env.DB, c.req.param("handle"), c.req.param("slug"));
    return door ? new Response((await ogPng(door)) as unknown as ArrayBuffer, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } }) : c.notFound();
  })
  .get("/d/:handle/:slug?", async (c) => {
    const handle = c.req.param("handle");
    const slug = c.req.param("slug") ?? PROFILE_SLUG;
    const door = await getDoor(c.env.DB, handle, slug);
    if (!door) return c.html(NotFoundDoor(), 404);
    const path = slug === PROFILE_SLUG ? `/d/${handle}` : `/d/${handle}/${slug}`;
    return c.html(DoorPage({ door, url: new URL(path, c.req.url).href, made: c.req.query("made") === "1" }));
  })
  .get("/app/*", (c) => c.env.ASSETS.fetch(new URL("/", c.req.url)))
  .get("/app", (c) => c.env.ASSETS.fetch(new URL("/", c.req.url)))
  .notFound((c) =>
    c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.env.ASSETS.fetch(c.req.raw),
  );

export default {
  fetch: app.fetch,
  async queue(batch) {
    for (const message of batch.messages) {
      console.log("job", message.body);
      message.ack();
    }
  },
  async scheduled(event, env) {
    console.log("cron", event.cron);
    await pruneLimits(env.DB);
  },
} satisfies ExportedHandler<Env>;

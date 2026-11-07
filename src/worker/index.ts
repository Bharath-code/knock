import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { check as checkDraft } from "../shared/checker";
import { createDoorSchema, defaultFields, pickTemplate, PROFILE_SLUG, handleSchema } from "../shared/door";
import { checkRequestSchema, tables, type Health } from "../shared/schema";
import { Door } from "./door";
import { CheckerPage } from "./checker-page";
import { DoorPage, NewDoorPage, NotFoundDoor, StatusPage } from "./door-pages";
import { sendClosure, sendReceipt, sendYes, type Closure, type Receipt } from "./email";
import { bookingUrl, YES_DELAY_S } from "../shared/booking";
import { closureMessage } from "../shared/closure";
import { closeJob, knockTemplate, stillAnswered, type CloseJob } from "./closure";
import { MAX_CODES, parseCodes } from "../shared/codes";
import { addCodes, codeFor, pools, yesCode } from "./codes";
import { getBooking, setBooking, stillYes, yesJob, type YesJob } from "./booking";
import { getStatus } from "./knocks";
import { asSource, emailKey, knockSchema } from "../shared/knock";
import { ogPng } from "./og";
import { createDoor, getDoor, ownerFromToken } from "./doors";
import { gate, ipKey, pruneLimits } from "./gate";
import { answerKnock, closeRest, listInbox, ownerDoorIds, ownerUser, ownsDoor, undoKnock, type OwnerUser } from "./inbox";
import { asAnswer, asReason, NOTE_MAX, type Reply } from "../shared/inbox";
import { Home } from "./home";
import { scoreDraft, type ModelResult } from "./model";

export { Door };

const validBody = validator("json", (value, c) => {
  const parsed = checkRequestSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : c.json({ error: "Send a post and a draft of up to 10,000 characters." }, 400);
});

type Secrets = Env & { ANTHROPIC_API_KEY?: string; TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_HOSTNAMES?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; CODES_KEY?: string };
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

const inbox = new Hono<{ Bindings: Secrets; Variables: { owner: OwnerUser } }>()
  .use(async (c, next) => {
    const o = await ownerUser(c.env.DB, getCookie(c, "ds"));
    if (!o) return c.json({ error: "Sign in to see your inbox." }, 401);
    c.set("owner", o);
    c.header("cache-control", "private, no-store");
    await next();
  })
  .get("/", async (c) => c.json(await listInbox(c.env.DB, c.get("owner"))))
  .post(
    "/:id/answer",
    validator("json", (v, c) => {
      const b = (v ?? {}) as { answer?: unknown; reason?: unknown; note?: unknown };
      const answer = asAnswer(b.answer);
      const reason = b.reason == null ? undefined : asReason(b.reason);
      const note = b.note == null ? "" : typeof b.note === "string" ? b.note.trim() : null;
      if (!answer || reason === null || note === null || note.length > NOTE_MAX) return c.json({ error: "Check the answer, reason and note (up to 140 characters)." }, 400);
      return { answer, reason, note } as Reply;
    }),
    async (c) => {
    const at = Date.now();
    const reply = { ...c.req.valid("json") };
    if (reply.answer !== "yes" && !reply.note) {
      const template = await knockTemplate(c.env.DB, c.get("owner"), c.req.param("id"));
      if (template) reply.note = closureMessage(template, reply.answer);
    }
    const ok = await answerKnock(c.env.DB, c.get("owner"), c.req.param("id"), reply, at);
    if (!ok) return c.json({ error: "That knock is no longer open." }, 409);
    let code: Awaited<ReturnType<typeof yesCode>> = "none";
    if (reply.answer === "yes") {
      code = await yesCode(c.env.DB, c.req.param("id"));
      const job = await yesJob(c.env.DB, c.get("owner"), c.req.param("id"), at);
      const owner = await ownerFromToken(c.env.DB, getCookie(c, "ds"));
      const who = owner?.name || `@${owner?.handle ?? "your door"}`;
      if (job) await c.env.JOBS.send({ ...job, who }, { delaySeconds: YES_DELAY_S });
    } else {
      const job = await closeJob(c.env.DB, c.get("owner"), c.req.param("id"), at);
      if (job) {
        const owner = await ownerFromToken(c.env.DB, getCookie(c, "ds"));
        await c.env.JOBS.send({ ...job, who: owner?.name || `@${owner?.handle ?? "your door"}` }, { delaySeconds: YES_DELAY_S });
      }
    }
    return c.json({ ok: true, code });
  })
  .get("/codes", async (c) => c.json(await pools(c.env.DB, c.get("owner"))))
  .post("/codes", async (c) => {
    if (!c.env.CODES_KEY) return c.json({ error: "Invite codes aren't set up yet." }, 503);
    const b = (await c.req.json().catch(() => ({}))) as { doorId?: unknown; text?: unknown };
    const o = c.get("owner");
    if (typeof b.doorId !== "string" || typeof b.text !== "string" || b.text.length > 100_000 || !(await ownsDoor(c.env.DB, o, b.doorId))) {
      return c.json({ error: "Pick one of your doors and paste your codes." }, 400);
    }
    const { codes, bad } = parseCodes(b.text);
    if (bad.length) return c.json({ error: `Codes use 4 to 64 letters, digits, - or _. Fix: ${bad.slice(0, 3).join(", ")}` }, 400);
    if (!codes.length || codes.length > MAX_CODES) return c.json({ error: `Add between 1 and ${MAX_CODES} codes at a time.` }, 400);
    return c.json(await addCodes(c.env.DB, c.env.CODES_KEY, b.doorId, o.orgId, codes));
  })
  .get("/booking", async (c) => c.json({ url: await getBooking(c.env.DB, c.get("owner")) }))
  .put("/booking", async (c) => {
    const raw = ((await c.req.json().catch(() => ({}))) as { url?: unknown }).url;
    const blank = typeof raw === "string" && raw.trim() === "";
    const url = blank ? null : bookingUrl(raw);
    if (!blank && !url) return c.json({ error: "Use an https link on cal.com or calendly.com." }, 400);
    await setBooking(c.env.DB, c.get("owner"), url);
    return c.json({ url });
  })
  .get("/doors", async (c) => c.json(await ownerDoorIds(c.env.DB, c.get("owner"))))
  .post("/close-rest", async (c) => {
    const closed = await closeRest(c.env.DB, c.get("owner"));
    const owner = await ownerFromToken(c.env.DB, getCookie(c, "ds"));
    const who = owner?.name || `@${owner?.handle ?? "your door"}`;
    for (let i = 0; i < closed.length; i += 100) {
      await c.env.JOBS.sendBatch(closed.slice(i, i + 100).map((x) => ({ body: { type: "closure", ...x, who } })));
    }
    return c.json({ closed: closed.length });
  })
  .post("/:id/undo", async (c) => {
    const ok = await undoKnock(c.env.DB, c.get("owner"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "Too late to undo." }, 409);
  });

const api = new Hono<AppEnv>()
  .route("/inbox", inbox)
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
  .get("/api/inbox-live/:doorId", async (c) => {
    if (c.req.header("upgrade") !== "websocket") return c.text("Expected a WebSocket.", 426);
    if (c.req.header("origin") !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
    const o = await ownerUser(c.env.DB, getCookie(c, "ds"));
    const id = c.req.param("doorId");
    if (!o || !(await ownsDoor(c.env.DB, o, id))) return c.text("Not found", 404);
    return c.env.DOOR.getByName(id).fetch(c.req.raw);
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
  .post("/d/:handle/:slug/knock", async (c) => {
    const slug = c.req.param("slug");
    const door = await getDoor(c.env.DB, c.req.param("handle"), slug);
    if (!door || door.status !== "open") return c.html(NotFoundDoor(), 404);
    const form = await c.req.parseBody({ all: true });
    const one = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const answers = [form.answer ?? []].flat().filter((v): v is string => typeof v === "string");
    const source = asSource(c.req.query("s"));
    const kept = { email: one("email").slice(0, 254), message: one("message").slice(0, 2000), answers, proof: one("proof").slice(0, 300) };
    const path = `/d/${door.handle}/${slug}`;
    const again = (error: string, status: 400 | 403 | 409 | 429 | 503) =>
      c.html(DoorPage({ door, url: new URL(path, c.req.url).href, made: false, siteKey: c.env.TURNSTILE_SITE_KEY, source, form: { ...kept, error } }), status);
    const parsed = knockSchema(door.fields.length).safeParse({ ...kept, consent: one("consent") });
    if (!parsed.success) return again("Fill every question, add your message and a valid email, and tick the consent box.", 400);
    const g = await gate(c.env, clientIp(c.req.raw), one("cf-turnstile-response"), "knock");
    if (g !== "ok") return again(gateMessage[g], g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    const k = parsed.data;
    const result = await c.env.DOOR.getByName(door.id).knock(
      {
        orgId: door.orgId, doorId: door.id, windowDays: door.windowDays, email: k.email, key: emailKey(k.email),
        message: k.message, answers: door.fields.map((q, i) => ({ q, a: k.answers[i]! })), proof: k.proof, source,
      },
      ipKey(clientIp(c.req.raw)),
    );
    if (!result.ok) {
      return result.reason === "duplicate"
        ? again("You already knocked on this door. Check your email for your status link.", 409)
        : again("Too many knocks from your network on this door. Try again in an hour.", 429);
    }
    const link = new URL(`/k/${result.token}`, c.req.url).href;
    await c.env.JOBS.send({ type: "receipt", to: k.email, link, who: door.name || `@${door.handle}`, days: door.windowDays });
    return c.redirect(`/k/${result.token}`, 303);
  })
  .get("/k/:token", async (c) => {
    const token = c.req.param("token");
    c.header("x-robots-tag", "noindex, nofollow");
    c.header("cache-control", "private, no-store");
    c.header("referrer-policy", "no-referrer");
    const status = /^[0-9a-f]{32}$/.test(token) ? await getStatus(c.env.DB, token) : null;
    if (!status) return c.html(NotFoundDoor(), 404);
    return c.html(StatusPage({ s: status, link: new URL(`/k/${token}`, c.req.url).href }));
  })
  .get("/d/:handle/:slug?", async (c) => {
    const handle = c.req.param("handle");
    const slug = c.req.param("slug") ?? PROFILE_SLUG;
    const door = await getDoor(c.env.DB, handle, slug);
    if (!door) return c.html(NotFoundDoor(), 404);
    const path = slug === PROFILE_SLUG ? `/d/${handle}` : `/d/${handle}/${slug}`;
    return c.html(DoorPage({ door, url: new URL(path, c.req.url).href, made: c.req.query("made") === "1", siteKey: c.env.TURNSTILE_SITE_KEY, source: asSource(c.req.query("s")) }));
  })
  .get("/app/*", (c) => c.env.ASSETS.fetch(new URL("/", c.req.url)))
  .get("/app", (c) => c.env.ASSETS.fetch(new URL("/", c.req.url)))
  .notFound((c) =>
    c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.env.ASSETS.fetch(c.req.raw),
  );

export default {
  fetch: app.fetch,
  async queue(batch, env) {
    for (const message of batch.messages) {
      const job = message.body as { type?: string; who: string } & Receipt & Closure & Omit<YesJob, "type"> & Partial<Pick<CloseJob, "later">>;
      if (job.type !== "receipt" && job.type !== "closure" && job.type !== "yes") {
        console.log("job", job.type);
        message.ack();
        continue;
      }
      try {
        if ((job.type === "yes" && !(await stillYes(env.DB, job.knockId, job.at))) || (job.type === "closure" && job.knockId && !(await stillAnswered(env.DB, job.knockId, job.at)))) {
          message.ack();
          continue;
        }
        const sent = await (job.type === "receipt"
          ? sendReceipt(env as Secrets, job)
          : job.type === "yes"
            ? sendYes(env as Secrets, { ...job, code: await codeFor(env.DB, (env as Secrets).CODES_KEY, job.knockId) })
            : sendClosure(env as Secrets, job));
        if (sent === "unconfigured") console.warn(`${job.type} not sent: RESEND_API_KEY or EMAIL_FROM missing`);
        message.ack();
      } catch (e) {
        console.error(`${job.type} failed`, e instanceof Error ? e.message : e);
        message.retry({ delaySeconds: 30 });
      }
    }
  },
  async scheduled(event, env) {
    console.log("cron", event.cron);
    await pruneLimits(env.DB);
  },
} satisfies ExportedHandler<Env>;

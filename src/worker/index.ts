import Anthropic from "@anthropic-ai/sdk";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { z } from "zod";
import { check as checkDraft } from "../shared/checker";
import { createDoorSchema, defaultFields, pickTemplate, PROFILE_SLUG, handleSchema } from "../shared/door";
import { checkRequestSchema, tables, type Health } from "../shared/schema";
import { Door } from "./door";
import { CheckerPage } from "./checker-page";
import { DeletedPage, DoorPage, ExamplePage, NewDoorPage, NotFoundDoor, PrivacyPage, StatusPage } from "./door-pages";
import { deleteByToken, purgeClosed } from "./retention";
import { asKnockId, asRef, asTemplate } from "../shared/growth";
import { sendClosure, sendDigest, sendNewSignIn, sendReceipt, sendSeen, sendSignIn, sendYes, type Closure, type Receipt } from "./email";
import { digestJobs, digestOn, setPrefs, tokenValid, unsubscribe, validTz, type DigestJob } from "./digest";
import { seenJobs, seenOff, stillSeen, type SeenJob } from "./seen";
import { confirmLink, deviceLabel, peekLink, personOfUser, PLACEHOLDER, pruneAuth, requestLink, SESSION_MS, signOut, signOutEverywhere } from "./auth";
import { ConfirmPage, SeenOffPage, SigninPage, UnsubscribePage } from "./auth-pages";
import { bookingUrl, YES_DELAY_S } from "../shared/booking";
import { closureMessage } from "../shared/closure";
import { closeExpired, notifyExpired } from "./expire";
import { closeJob, knockTemplate, stillAnswered, type CloseJob } from "./closure";
import { MAX_CODES, parseCodes } from "../shared/codes";
import { addCodes, codeFor, pools, yesCode } from "./codes";
import { getBooking, setBooking, stillYes, yesJob, type YesJob } from "./booking";
import { getStatus } from "./knocks";
import { asSource, emailKey, knockSchema } from "../shared/knock";
import { cleanPage, feedbackSchema, listFeedback, markReviewed, saveFeedback } from "./feedback";
import { FeedbackAdminPage, FeedbackPage } from "./feedback-page";
import { answeredPng, ogPng, rewritePng, scorePng } from "./og";
import { createDoor, getDoor, ownerFromToken, sha256 } from "./doors";
import { gate, ipKey, pruneLimits, withinLimit } from "./gate";
import { d1Metrics, eventCounts, isAdmin, isBot, track, viewSource } from "./metrics";
import { MetricsPage } from "./metrics-page";
import { answerKnock, closeRest, listInbox, markSeen, ownerDoorIds, ownerUser, ownsDoor, undoKnock, type OwnerUser } from "./inbox";
import { asAnswer, asReason, NOTE_MAX, type Reply } from "../shared/inbox";
import { Home } from "./home";
import { scoreDraft, type ModelResult } from "./model";
import { loadRankInput, pickRanker, rulesRanker, saveRank, transient } from "./rank";

export { Door };

const validBody = validator("json", (value, c) => {
  const parsed = checkRequestSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : c.json({ error: "Send a post and a draft of up to 10,000 characters." }, 400);
});

type Secrets = Env & { ANTHROPIC_API_KEY?: string; TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string; TURNSTILE_HOSTNAMES?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; CODES_KEY?: string; PUBLIC_ORIGIN?: string; RANKER?: string; ADMIN_EMAILS?: string; FUNNEL_DATASET?: string; ANALYTICS_SQL?: { query(q: { query: string }): Promise<{ data: Record<string, unknown>[] }> } };
type AppEnv = { Bindings: Secrets };

const sameOrigin = (req: Request) => req.headers.get("origin") === new URL(req.url).origin;
const emailSchema = z.string().trim().email().max(254);
const LINKS_PER_EMAIL_HOUR = 3;

// A link is sent at most 3 times an hour per address. Over the limit the caller still sees "check your email".
const mailLink = async (env: Secrets, db: D1Database, to: string, origin: string, personId: string | null, handle?: string | null) => {
  if (!(await withinLimit(db, `link-email:${await sha256(emailKey(to))}`, Date.now(), LINKS_PER_EMAIL_HOUR))) return;
  const token = await requestLink(db, to, personId);
  try {
    await sendSignIn(env, { to, link: new URL(`/signin/confirm?t=${token}`, origin).href, handle });
  } catch (e) {
    console.error("sign-in email failed", e instanceof Error ? e.message : e);
  }
};

const sessionCookie = (url: string) => ({ httpOnly: true, secure: new URL(url).protocol === "https:", sameSite: "Lax" as const, path: "/", maxAge: SESSION_MS / 1000 });

const cardResponse = (png: Uint8Array) => new Response(png as unknown as ArrayBuffer, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
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

const isAdminRequest = async (c: Context<{ Bindings: Secrets }>) => {
  const o = await ownerUser(c.env.DB, getCookie(c, "ds"));
  const p = o && (await personOfUser(c.env.DB, o.userId));
  return !!p && isAdmin(p.email, c.env.ADMIN_EMAILS);
};

const inbox = new Hono<{ Bindings: Secrets; Variables: { owner: OwnerUser } }>()
  .use(async (c, next) => {
    const o = await ownerUser(c.env.DB, getCookie(c, "ds"));
    if (!o) return c.json({ error: "Sign in to see your inbox." }, 401);
    c.set("owner", o);
    c.header("cache-control", "private, no-store");
    await next();
  })
  .get("/", async (c) => {
    const seen = await markSeen(c.env.DB, c.get("owner"));
    if (seen.length) {
      track(c.env.FUNNEL, "seen", "", "", seen.length);
      try {
        const jobs = await seenJobs(c.env.DB, seen);
        for (let i = 0; i < jobs.length; i += 100) await c.env.JOBS.sendBatch(jobs.slice(i, i + 100).map((body) => ({ body })));
      } catch (e) {
        console.error("seen enqueue failed", e instanceof Error ? e.message : e);
      }
    }
    return c.json(await listInbox(c.env.DB, c.get("owner")));
  })
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
    track(c.env.FUNNEL, "answered", reply.answer, c.req.param("id"));
    if (reply.answer === "yes") track(c.env.FUNNEL, "yes", "", c.req.param("id"));
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
  .get("/account", async (c) => {
    const p = await personOfUser(c.env.DB, c.get("owner").userId);
    return c.json({ email: p && !p.email.endsWith(PLACEHOLDER) ? p.email : null, handle: p?.handle ?? null, digest: p ? await digestOn(c.env.DB, p.id) : false });
  })
  .put("/prefs", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { tz?: unknown; digest?: unknown };
    if ((b.tz !== undefined && !validTz(b.tz)) || (b.digest !== undefined && typeof b.digest !== "boolean")) return c.json({ error: "Check the timezone and digest setting." }, 400);
    const p = await personOfUser(c.env.DB, c.get("owner").userId);
    if (!p) return c.json({ error: "That account no longer exists." }, 404);
    await setPrefs(c.env.DB, p.id, { tz: b.tz as string | undefined, digest: b.digest as boolean | undefined });
    return c.json({ ok: true, digest: await digestOn(c.env.DB, p.id) });
  })
  .post("/email", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
    const email = emailSchema.safeParse(((await c.req.json().catch(() => ({}))) as { email?: unknown }).email);
    if (!email.success) return c.json({ error: "Enter a valid email address." }, 400);
    const o = c.get("owner");
    const p = await personOfUser(c.env.DB, o.userId);
    if (!p || !p.email.endsWith(PLACEHOLDER)) return c.json({ error: "This account already has an email." }, 409);
    if (!(await withinLimit(c.env.DB, `claim-user:${o.userId}`, Date.now(), 5))) return c.json({ error: "Too many tries. Try again in an hour." }, 429);
    await mailLink(c.env, c.env.DB, email.data, new URL(c.req.url).origin, p.id, p.handle);
    return c.json({ ok: true });
  })
  .post("/signout", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ error: "Forbidden" }, 403);
    const all = ((await c.req.json().catch(() => ({}))) as { all?: unknown }).all === true;
    const o = c.get("owner");
    if (all) {
      if (!(await signOutEverywhere(c.env.DB, o.userId, o.orgId))) return c.json({ error: "Add and confirm an email first, so you can sign back in." }, 409);
    } else {
      const t = getCookie(c, "ds");
      if (t && (await signOut(c.env.DB, t)) === "anonymous") {
        return c.json({ error: "Add and confirm an email first. Without one, signing out would lock you out of your door." }, 409);
      }
    }
    deleteCookie(c, "ds", { path: "/" });
    return c.json({ ok: true });
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
    if (closed.length) track(c.env.FUNNEL, "answered", "close_rest", "", closed.length);
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
      analyticsSql: await check(async () => {
        const r = await eventCounts(c.env.ANALYTICS_SQL, c.env.FUNNEL_DATASET);
        if (r && "error" in r) throw new Error(r.error);
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
  // GET only shows a button, so mail scanners that prefetch links cannot unsubscribe anyone.
  // POST is RFC 8058 one-click: mail providers send it server to server, with no cookie or Origin, so no sameOrigin check.
  .get("/u/:token", async (c) => {
    c.header("cache-control", "private, no-store");
    return c.html(UnsubscribePage({ token: c.req.param("token"), valid: await tokenValid(c.env.DB, c.req.param("token")) }));
  })
  .post("/u/:token", async (c) => {
    c.header("cache-control", "private, no-store");
    const ok = await unsubscribe(c.env.DB, c.req.param("token"));
    return c.html(UnsubscribePage({ token: c.req.param("token"), valid: ok, done: ok }), ok ? 200 : 404);
  })
  .get("/u/:token/seen", async (c) => {
    c.header("cache-control", "private, no-store");
    return c.html(SeenOffPage({ token: c.req.param("token"), valid: await tokenValid(c.env.DB, c.req.param("token")) }));
  })
  .post("/u/:token/seen", async (c) => {
    c.header("cache-control", "private, no-store");
    const ok = await seenOff(c.env.DB, c.req.param("token"));
    return c.html(SeenOffPage({ token: c.req.param("token"), valid: ok, done: ok }), ok ? 200 : 404);
  })
  .get("/signin", (c) => c.html(SigninPage({ siteKey: c.env.TURNSTILE_SITE_KEY })))
  .post("/signin", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.text("Forbidden", 403);
    const form = await c.req.parseBody();
    const one = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const siteKey = c.env.TURNSTILE_SITE_KEY;
    const email = emailSchema.safeParse(one("email"));
    if (!email.success) return c.html(SigninPage({ siteKey, error: "Enter a valid email address.", email: one("email").slice(0, 254) }), 400);
    const g = await gate(c.env, clientIp(c.req.raw), one("cf-turnstile-response"), "signin");
    if (g !== "ok") return c.html(SigninPage({ siteKey, error: gateMessage[g], email: email.data }), g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    await mailLink(c.env, c.env.DB, email.data, new URL(c.req.url).origin, null);
    return c.html(SigninPage({ sent: true }));
  })
  .get("/signin/confirm", async (c) => {
    c.header("cache-control", "no-store");
    // same-origin, not no-referrer: no-referrer makes browsers send Origin: null on this page's own form POST,
    // which fails the sameOrigin check. The token still never leaves the site in a Referer.
    c.header("referrer-policy", "same-origin");
    const token = c.req.query("t") ?? "";
    const link = token ? await peekLink(c.env.DB, token) : null;
    if (!link) return c.html(ConfirmPage({ token: "", error: "This link has expired or was already used. Ask for a new one." }), 400);
    const replacing = (await ownerUser(c.env.DB, getCookie(c, "ds"))) !== null;
    return c.html(ConfirmPage({ token, link: { email: link.email, handle: link.handle, claim: link.claim === 1, replacing } }));
  })
  .post("/signin/confirm", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.text("Forbidden", 403);
    c.header("cache-control", "no-store");
    const t = ((await c.req.parseBody()).t ?? "") as string;
    const device = deviceLabel(c.req.header("user-agent"));
    const done = typeof t === "string" && t ? await confirmLink(c.env.DB, t, Date.now(), device) : null;
    if (!done?.ok) return c.html(ConfirmPage({ token: "", error: done?.error ?? "This link is not valid. Ask for a new one." }), 400);
    if (done.alert) {
      await sendNewSignIn(c.env, { to: done.alert, device, when: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC", link: new URL("/app", c.req.url).href }).catch((e) =>
        console.error("sign-in alert failed", e instanceof Error ? e.message : e),
      );
    }
    setCookie(c, "ds", done.token, sessionCookie(c.req.url));
    return c.redirect("/app", 303);
  })
  // Every "make your own door" link lands here first so the click is counted, then goes to the prefilled form.
  .get("/go/door", (c) => {
    const from = asRef(c.req.query("from"));
    const t = asTemplate(c.req.query("t"));
    const k = asKnockId(c.req.query("k"));
    if (from) track(c.env.FUNNEL, "own_door_click", from, t ?? "");
    return c.redirect(`/new${from ? `?ref=${from}${t ? `&t=${t}` : ""}${k ? `&k=${k}` : ""}` : ""}`, 302);
  })
  .get("/new", async (c) => {
    // Starts the first-door timer; the POST reads it and clears it.
    if (!getCookie(c, "nt")) setCookie(c, "nt", String(Date.now()), { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/new", maxAge: 3600 });
    return c.html(NewDoorPage({ owner: await ownerFromToken(c.env.DB, getCookie(c, "ds")), siteKey: c.env.TURNSTILE_SITE_KEY, ref: asRef(c.req.query("ref")), k: asKnockId(c.req.query("k")), starter: asTemplate(c.req.query("t")) }));
  })
  .post("/new", async (c) => {
    const form = await c.req.parseBody({ all: true });
    const one = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const many = (k: string) => [form[k] ?? []].flat().filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    const token = getCookie(c, "ds");
    const owner = await ownerFromToken(c.env.DB, token);
    const post = one("post").slice(0, 10_000);
    const handleIn = owner?.handle ?? one("handle");
    const ref = asRef(one("ref"));
    const k = asKnockId(one("k"));
    const base = { owner, siteKey: c.env.TURNSTILE_SITE_KEY, post, handle: handleIn, name: one("name"), ref, k };
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
    const startedAt = Number(getCookie(c, "nt"));
    const made = await createDoor(c.env.DB, parsed.data, token, Number.isFinite(startedAt) && startedAt > 0 ? startedAt : undefined, k);
    if (!made.ok) return bad(made.error);
    deleteCookie(c, "nt", { path: "/new" });
    if (ref) track(c.env.FUNNEL, "own_door_created", ref, parsed.data.template);
    if (made.token) setCookie(c, "ds", made.token, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: 31_536_000 });
    return c.redirect(made.slug === PROFILE_SLUG ? `/d/${made.handle}?made=1` : `/d/${made.handle}/${made.slug}?made=1`, 303);
  })
  .get("/og/score.png", async (c) => cardResponse(await scorePng(c.req.query("s"))))
  .get("/og/rewrite.png", async (c) => cardResponse(await rewritePng(c.req.query("b"), c.req.query("a"))))
  .get("/og/answered.png", async (c) => cardResponse(await answeredPng(c.req.query("n"), c.req.query("m"))))
  .get("/d/:handle/:slug/og.png", async (c) => {
    const door = await getDoor(c.env.DB, c.req.param("handle"), c.req.param("slug"));
    return door ? new Response((await ogPng(door)) as unknown as ArrayBuffer, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } }) : c.notFound();
  })
  .post("/d/:handle/:slug/knock", async (c) => {
    const slug = c.req.param("slug");
    const door = await getDoor(c.env.DB, c.req.param("handle"), slug);
    if (!door || door.status !== "open") return c.html(NotFoundDoor(), 404);
    // ponytail: a submit attempt stands in for "started the form", so public pages stay script-free
    track(c.env.FUNNEL, "knock_start", viewSource(c.req.query("s")), door.id);
    const form = await c.req.parseBody({ all: true });
    const one = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const answers = [form.answer ?? []].flat().filter((v): v is string => typeof v === "string");
    const source = asSource(c.req.query("s"));
    const kept = { email: one("email").slice(0, 254), message: one("message").slice(0, 2000), answers, proof: one("proof").slice(0, 300) };
    const path = `/d/${door.handle}/${slug}`;
    const again = (error: string, status: 400 | 403 | 409 | 429 | 503) =>
      c.html(DoorPage({ door, url: new URL(path, c.req.url).href, made: false, siteKey: c.env.TURNSTILE_SITE_KEY, source: viewSource(c.req.query("s")), form: { ...kept, error } }), status);
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
    track(c.env.FUNNEL, "knock_sent", viewSource(c.req.query("s")), door.id);
    const link = new URL(`/k/${result.token}`, c.req.url).href;
    await c.env.JOBS.send({ type: "receipt", to: k.email, link, who: door.name || `@${door.handle}`, days: door.windowDays, k: result.id });
    return c.redirect(`/k/${result.token}`, 303);
  })
  .post("/k/:token/delete", async (c) => {
    const token = c.req.param("token");
    c.header("cache-control", "private, no-store");
    c.header("referrer-policy", "no-referrer");
    // No sameOrigin check: the status page's no-referrer policy makes browsers send Origin: null, and the
    // unguessable token in the path, not a cookie, is the credential, so a cross-site form can't forge it.
    const gone = /^[0-9a-f]{32}$/.test(token) ? await deleteByToken(c.env.DB, token) : null;
    if (!gone) return c.html(NotFoundDoor(), 404);
    await c.env.DOOR.getByName(gone.doorId).announce();
    return c.html(DeletedPage());
  })
  .get("/privacy", (c) => c.html(PrivacyPage()))
  .get("/example", (c) => c.html(ExamplePage()))
  // Private: only ADMIN_EMAILS see it; everyone else gets the same 404 as a missing page.
  .get("/feedback", (c) => c.html(FeedbackPage({ siteKey: c.env.TURNSTILE_SITE_KEY, page: cleanPage(c.req.query("from") ?? "") })))
  .post("/feedback", async (c) => {
    const form = await c.req.parseBody();
    const text = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const kept = { siteKey: c.env.TURNSTILE_SITE_KEY, page: cleanPage(text("page")), body: text("body").slice(0, 2000), contact: text("contact").slice(0, 200), tag: text("tag") };
    const parsed = feedbackSchema.safeParse({ tag: text("tag"), body: text("body"), contact: text("contact"), page: text("page") });
    if (!parsed.success) return c.html(FeedbackPage({ ...kept, error: "Pick what it is and write a message, up to 2,000 characters." }), 400);
    if (parsed.data.contact && !z.string().email().safeParse(parsed.data.contact).success) return c.html(FeedbackPage({ ...kept, error: "That email doesn't look right. Leave it blank to skip." }), 400);
    const g = await gate(c.env, clientIp(c.req.raw), text("cf-turnstile-response"), "feedback");
    if (g !== "ok") return c.html(FeedbackPage({ ...kept, error: gateMessage[g] }), g === "limited" ? 429 : g === "captcha" ? 403 : 503);
    const o = await ownerUser(c.env.DB, getCookie(c, "ds"));
    const p = o && (await personOfUser(c.env.DB, o.userId));
    await saveFeedback(c.env.DB, parsed.data, p ? p.id : null);
    c.header("cache-control", "private, no-store");
    return c.html(FeedbackPage({ sent: true }));
  })
  .get("/admin/feedback", async (c) => {
    c.header("cache-control", "private, no-store");
    c.header("x-robots-tag", "noindex, nofollow");
    if (!(await isAdminRequest(c))) return c.html(NotFoundDoor(), 404);
    return c.html(FeedbackAdminPage({ rows: await listFeedback(c.env.DB), cleared: c.req.query("cleared") === undefined ? undefined : Number(c.req.query("cleared")) || 0 }));
  })
  .post("/admin/feedback", async (c) => {
    c.header("cache-control", "private, no-store");
    if (!sameOrigin(c.req.raw) || !(await isAdminRequest(c))) return c.html(NotFoundDoor(), 404);
    return c.redirect(`/admin/feedback?cleared=${await markReviewed(c.env.DB)}`, 303);
  })
  .get("/admin/metrics", async (c) => {
    c.header("cache-control", "private, no-store");
    c.header("x-robots-tag", "noindex, nofollow");
    if (!(await isAdminRequest(c))) return c.html(NotFoundDoor(), 404);
    const [d1, events] = await Promise.all([d1Metrics(c.env.DB), eventCounts(c.env.ANALYTICS_SQL, c.env.FUNNEL_DATASET)]);
    return c.html(MetricsPage({ d1, events }));
  })
  .get("/k/:token", async (c) => {
    const token = c.req.param("token");
    c.header("x-robots-tag", "noindex, nofollow");
    c.header("cache-control", "private, no-store");
    c.header("referrer-policy", "no-referrer");
    const status = /^[0-9a-f]{32}$/.test(token) ? await getStatus(c.env.DB, token) : null;
    if (!status) return c.html(NotFoundDoor(), 404);
    return c.html(StatusPage({ s: status, link: new URL(`/k/${token}`, c.req.url).href, token }));
  })
  .get("/d/:handle/:slug?", async (c) => {
    const handle = c.req.param("handle");
    const slug = c.req.param("slug") ?? PROFILE_SLUG;
    const door = await getDoor(c.env.DB, handle, slug);
    if (!door) return c.html(NotFoundDoor(), 404);
    if (!isBot(c.req.header("user-agent"))) track(c.env.FUNNEL, "door_view", viewSource(c.req.query("s")), door.id);
    const path = slug === PROFILE_SLUG ? `/d/${handle}` : `/d/${handle}/${slug}`;
    return c.html(DoorPage({ door, url: new URL(path, c.req.url).href, made: c.req.query("made") === "1", siteKey: c.env.TURNSTILE_SITE_KEY, source: viewSource(c.req.query("s")) }));
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
      if (job.type === "rank") {
        const { knockId, doorId } = message.body as { knockId: string; doorId: string };
        try {
          const input = await loadRankInput(env.DB, knockId);
          const ranker = pickRanker(env as Secrets, (apiKey) => new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }));
          if (!input || !ranker) { message.ack(); continue; }
          let out = await ranker.rank(input);
          if (!out.ok && transient(out.reason) && message.attempts < 5) { message.retry({ delaySeconds: 20 * message.attempts }); continue; }
          if (!out.ok) {
            console.warn(`rank fell back to rules: ${out.reason}`);
            out = await rulesRanker.rank(input);
          }
          if (out.ok && (await saveRank(env.DB, knockId, out.rank))) await env.DOOR.getByName(doorId).announce();
          message.ack();
        } catch (e) {
          console.error("rank failed", e instanceof Error ? e.message : e);
          message.retry({ delaySeconds: 30 });
        }
        continue;
      }
      if (job.type === "digest") {
        const d = message.body as DigestJob;
        const origin = (env as Secrets).PUBLIC_ORIGIN;
        try {
          if (!origin) throw new Error("PUBLIC_ORIGIN missing");
          const sent = await sendDigest(env as Secrets, { ...d, inbox: new URL("/app", origin).href, unsubscribe: new URL(`/u/${d.token}`, origin).href });
          if (sent === "unconfigured") console.warn("digest not sent: RESEND_API_KEY or EMAIL_FROM missing");
          message.ack();
        } catch (e) {
          console.error("digest failed", e instanceof Error ? e.message : e);
          message.retry({ delaySeconds: 60 });
        }
        continue;
      }
      if (job.type === "seen") {
        const s = message.body as SeenJob;
        const origin = (env as Secrets).PUBLIC_ORIGIN;
        try {
          if (!origin) throw new Error("PUBLIC_ORIGIN missing");
          if (await stillSeen(env.DB, s.knockId)) {
            const sent = await sendSeen(env as Secrets, { to: s.to, who: s.who, off: new URL(`/u/${s.token}/seen`, origin).href, k: s.knockId });
            if (sent === "unconfigured") console.warn("seen not sent: RESEND_API_KEY or EMAIL_FROM missing");
          }
          message.ack();
        } catch (e) {
          console.error("seen failed", e instanceof Error ? e.message : e);
          message.retry({ delaySeconds: 60 });
        }
        continue;
      }
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
            ? sendYes(env as Secrets, { ...job, k: job.knockId, code: await codeFor(env.DB, (env as Secrets).CODES_KEY, job.knockId) })
            : sendClosure(env as Secrets, { ...job, k: job.k ?? job.knockId }));
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
    await pruneAuth(env.DB);
    await notifyExpired(env.JOBS, await closeExpired(env.DB, null));
    await purgeClosed(env.DB);
    const digests = await digestJobs(env.DB);
    for (let i = 0; i < digests.length; i += 100) await env.JOBS.sendBatch(digests.slice(i, i + 100).map((body) => ({ body })));
  },
} satisfies ExportedHandler<Env>;

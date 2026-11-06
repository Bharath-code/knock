import { Hono } from "hono";
import { validator } from "hono/validator";
import { check as checkDraft } from "../shared/checker";
import { checkRequestSchema, tables, type Health } from "../shared/schema";
import { Door } from "./door";
import { Home } from "./home";

export { Door };

const api = new Hono<{ Bindings: Env }>()
  .get("/health", (c) => c.json({ status: "ok" } satisfies Health))
  .post(
    "/check",
    validator("json", (value, c) => {
      const parsed = checkRequestSchema.safeParse(value);
      return parsed.success
        ? parsed.data
        : c.json({ error: "Send a post and a draft of up to 10,000 characters." }, 400);
    }),
    (c) => c.json(checkDraft(c.req.valid("json").draft)),
  );

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

const app = new Hono<{ Bindings: Env }>()
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
  async scheduled(event) {
    console.log("cron", event.cron);
  },
} satisfies ExportedHandler<Env>;

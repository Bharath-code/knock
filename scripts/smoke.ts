import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const local = base.includes("localhost");
const vars = local ? ".dev.vars" : ".dev.vars.staging";
if (/doorbell\.kumarbharath63\.workers\.dev/.test(base)) throw new Error("Refusing to run against live. See CLAUDE.md.");
const token = /^SMOKE_TOKEN=(.+)$/m.exec(readFileSync(vars, "utf8"))?.[1];
if (!token) throw new Error(`SMOKE_TOKEN missing from ${vars}`);

let failed = false;
const assert = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
  failed ||= !ok;
};

const home = await fetch(`${base}/`);
const homeHtml = await home.text();
assert("public page", home.ok && homeHtml.includes("Every knock gets an answer."));
assert("public page ships no JS", !homeHtml.includes("<script"));

const app = await fetch(`${base}/app`);
assert("react shell", app.ok && (await app.text()).includes('id="root"'));

assert("unknown path is a 404", (await fetch(`${base}/no-such-page`)).status === 404);

const css = /<link rel="stylesheet" href="([^"]+)"/.exec(homeHtml)?.[1];
const stylesheet = await fetch(`${base}${css}`, { headers: { accept: "text/css" } });
assert("public stylesheet", stylesheet.ok && (await stylesheet.text()).includes("--brand-ink"));

const health = await fetch(`${base}/api/health`);
assert("api health", health.ok && ((await health.json()) as { status: string }).status === "ok");

const post = (body: unknown) =>
  fetch(`${base}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const started = performance.now();
const checked = await post({ post: "Hiring backend", draft: "6 yrs in Go. See a.dev. Open to a call?" });
const checkMs = Math.round(performance.now() - started);
const result = (await checked.json()) as Record<string, { ok: boolean }>;
assert("check returns all five rules", ["length", "numbers", "link", "ask", "typos"].every((k) => result[k]?.ok));
assert("check under 300 ms", checkMs < 300, `${checkMs} ms`);
assert("check rejects a bad body", (await post({ draft: "   " })).status === 400);

assert("smoke needs a token",(await fetch(`${base}/api/smoke`)).status === 404);

const smoke = await fetch(`${base}/api/smoke`, { headers: { "x-smoke-token": token } });
const body = (await smoke.json()) as Record<string, string>;
for (const [binding, result] of Object.entries(body)) assert(binding, result === "ok", result);

if (local) {
  const cron = await fetch(`${base}/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*`);
  assert("cron handler", cron.ok);
}

process.exit(failed ? 1 : 0);

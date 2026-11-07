/** @jsxImportSource hono/jsx */
import css from "../styles/theme.css?url";
import type { CheckResult } from "../shared/checker";
import type { ModelCheck } from "./model";

export type PageState = {
  post?: string;
  draft?: string;
  siteKey?: string;
  error?: string;
  rules?: CheckResult;
  model?: ModelCheck | "unavailable";
};

const RING = 2 * Math.PI * 42;

const ScoreRing = ({ fit }: { fit: number }) => (
  <div class="relative size-28 shrink-0" role="img" aria-label={`Fit ${fit} out of 5`}>
    <svg viewBox="0 0 100 100" class="size-full -rotate-90">
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" stroke-width="9" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke={fit >= 4 ? "var(--yes)" : fit === 3 ? "var(--later)" : "var(--no)"}
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray={`${(RING * fit) / 5} ${RING}`}
      />
    </svg>
    <p class="absolute inset-0 grid place-content-center text-center font-display text-3xl font-extrabold">
      {fit}
      <span class="block font-body text-xs font-medium text-muted">of 5</span>
    </p>
  </div>
);

const rows = (r: CheckResult) =>
  [
    ["Length", r.length.ok, r.length.hint ?? `${r.length.count} of ${r.length.limit} characters`],
    ["Number", r.numbers.ok, r.numbers.hint ?? "Has a number"],
    ["Link", r.link.ok, r.link.hint ?? "One link"],
    ["Ask", r.ask.ok, r.ask.hint ?? "Clear ask"],
    [
      "Typos",
      r.typos.ok,
      r.typos.ok ? "None found" : `${r.typos.hint} ${r.typos.found.map((t) => `${t.word} → ${t.fix}`).join(", ")}`,
    ],
  ] as const;

const Results = ({ rules, model }: Pick<PageState, "rules" | "model">) => (
  <section class="mt-8 rounded-lg border border-line bg-card p-5 shadow-e-1" aria-labelledby="results">
    <h2 id="results" class="text-2xl font-extrabold">Your result</h2>
    {model && model !== "unavailable" && (
      <div class="mt-4 flex items-center gap-5">
        <ScoreRing fit={model.fit} />
        <div>
          <p class="font-medium">How well your draft fits the post</p>
          {model.tips.length > 0 && (
            <ul class="mt-2 list-disc space-y-1 pl-5 text-[15px]">
              {model.tips.map((t) => <li>{t}</li>)}
            </ul>
          )}
        </div>
      </div>
    )}
    {model === "unavailable" && (
      <p class="mt-3 text-[15px] text-muted">Suggestions didn't load this time. The checks below still work.</p>
    )}
    {rules && (
      <ul class="mt-5 divide-y divide-line text-[15px]">
        {rows(rules).map(([name, ok, text]) => (
          <li class="flex gap-3 py-2">
            <span class={`w-14 shrink-0 font-mono text-xs uppercase ${ok ? "text-yes" : "text-no"}`}>{ok ? "Pass" : "Fix"}</span>
            <span><strong class="font-medium">{name}.</strong> {text}</span>
          </li>
        ))}
      </ul>
    )}
    {model && model !== "unavailable" && model.rewrite && (
      <div class="mt-6">
        <label for="rewrite" class="font-medium">Improved version</label>
        <textarea id="rewrite" readonly rows={6} class="mt-2 w-full rounded-md border border-line bg-sunk p-3 text-[15px]">
          {model.rewrite}
        </textarea>
        <button
          type="button"
          data-copy="rewrite"
          class="mt-2 min-h-11 rounded-pill bg-brass px-5 font-medium text-on-accent"
        >
          Use improved version
        </button>
        <p class="mt-1 text-[13px] text-muted">Copies it. Check the facts are yours before you send.</p>
      </div>
    )}
  </section>
);

const copyScript = `document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.copy);navigator.clipboard.writeText(t.value).then(function(){b.textContent='Copied'});t.select()})})`;

export const CheckerPage = ({ post = "", draft = "", siteKey, error, rules, model }: PageState) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Free DM checker | Doorbell</title>
      <meta name="description" content="Paste the post and your DM. Get a fit score, plain tips and a tighter version in seconds." />
      <link rel="stylesheet" href={css} />
      {siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
    </head>
    <body class="bg-paper text-ink">
      <main class="mx-auto max-w-[65ch] px-5 py-10">
        <p class="font-mono text-xs tracking-[.12em] text-brass uppercase">Doorbell</p>
        <h1 class="mt-3 text-[34px] font-extrabold sm:text-[44px]">Will your DM get a reply?</h1>
        <p class="mt-3 text-muted">Paste the post and your message. Free, no sign-up.</p>

        {error && <p role="alert" class="mt-5 rounded-md border border-no p-3 text-[15px] text-no">{error}</p>}

        <form method="post" action="/check" class="mt-6 space-y-4">
          <div>
            <label for="post" class="font-medium">The post you are replying to <span class="text-muted">(optional)</span></label>
            <textarea id="post" name="post" rows={4} maxlength={10000} class="mt-1 w-full rounded-md border border-line bg-card p-3">{post}</textarea>
          </div>
          <div>
            <label for="draft" class="font-medium">Your DM</label>
            <textarea id="draft" name="draft" rows={6} maxlength={10000} required class="mt-1 w-full rounded-md border border-line bg-card p-3">{draft}</textarea>
          </div>
          {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} />}
          <button type="submit" class="min-h-11 w-full rounded-pill bg-brass px-6 font-medium text-on-accent sm:w-auto">
            Check my DM
          </button>
        </form>

        {(rules || model) && <Results rules={rules} model={model} />}
      </main>
      <script dangerouslySetInnerHTML={{ __html: copyScript }} />
    </body>
  </html>
);

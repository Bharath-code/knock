/** @jsxImportSource hono/jsx */
import { alert, button, card, input, label } from "../shared/ui";
import { Shell } from "./door-pages";
import { check, diffWords, ruleScore, type CheckResult } from "../shared/checker";
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
    <p class="absolute inset-0 grid place-content-center text-center font-display text-3xl font-semibold tabular">
      {fit}
      <span class="block font-body text-xs font-medium text-muted-foreground">of 5</span>
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

const Score = ({ n, label: l, tone }: { n: number; label: string; tone: string }) => (
  <p class={`rounded-lg border border-line px-4 py-3 text-sm ${tone}`}>
    <span class="block text-xs text-muted-foreground">{l}</span>
    <span class="font-display text-2xl font-semibold tabular">{n}/5</span> rules passed
  </p>
);

const BeforeAfter = ({ draft, before, rewrite }: { draft: string; before: CheckResult; rewrite: string }) => {
  const b = ruleScore(before);
  const a = ruleScore(check(rewrite));
  return (
    <div class="mt-8 border-t border-line pt-6" aria-labelledby="ba">
      <h3 id="ba" class="text-xl">Before and after</h3>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <Score n={b} label="Your DM" tone="" />
        <Score n={a} label="Improved version" tone="" />
      </div>
      <p class="mt-4 text-sm text-muted-foreground">Same five rules for both. <del class="bg-no-soft text-no">Removed</del> <ins class="bg-yes-soft text-yes no-underline">added</ins></p>
      <p class="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-sunk p-4 text-sm">
        {diffWords(draft, rewrite).map((p) =>
          p.kind === "del" ? <del class="bg-no-soft text-no">{p.text}</del> : p.kind === "add" ? <ins class="bg-yes-soft text-yes no-underline">{p.text}</ins> : p.text,
        )}
      </p>
      <label for="rewrite" class={`${label} mt-5 block`}>Improved version</label>
      <textarea id="rewrite" readonly rows={6} class={`${input} mt-1.5 bg-sunk`}>{rewrite}</textarea>
      <div class="mt-3 flex flex-wrap gap-3">
        <button type="button" hidden data-use="draft" data-from="rewrite" class={button({ variant: "default" })}>Use this version</button>
        <button type="button" data-copy="rewrite" class={button({ variant: "outline" })}>Copy</button>
        <a href={`/og/rewrite.png?b=${b}&a=${a}`} download="doorbell-before-after.png" class={button({ variant: "outline" })}>Download image</a>
      </div>
      <p class="mt-2 text-sm text-muted-foreground">The image shows only the two scores. Check the facts are yours before you send.</p>
    </div>
  );
};

const Results = ({ rules, model, draft }: Pick<PageState, "rules" | "model" | "draft">) => (
  <section class={`mt-10 p-5 sm:p-8 ${card}`} aria-labelledby="results">
    <h2 id="results" class="text-2xl">Your result</h2>
    {model && model !== "unavailable" && (
      <div class="mt-4 flex items-center gap-5">
        <ScoreRing fit={model.fit} />
        <div>
          <p class="font-medium">How well your draft fits the post</p>
          {model.tips.length > 0 && (
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
              {model.tips.map((t) => <li>{t}</li>)}
            </ul>
          )}
        </div>
      </div>
    )}
    {model === "unavailable" && (
      <p class="mt-3 text-sm text-muted-foreground">Suggestions didn't load this time. The checks below still work.</p>
    )}
    {rules && (
      <ul class="mt-6 divide-y divide-line border-t border-line text-sm">
        {rows(rules).map(([name, ok, text]) => (
          <li class="flex items-start gap-3 py-3">
            <span class={`inline-flex w-12 shrink-0 justify-center rounded-full py-0.5 text-xs font-medium ${ok ? "bg-yes-soft text-yes" : "bg-no-soft text-no"}`}>{ok ? "Pass" : "Fix"}</span>
            <span><strong class="font-medium">{name}.</strong> {text}</span>
          </li>
        ))}
      </ul>
    )}
    {model && model !== "unavailable" && model.rewrite && rules && <BeforeAfter draft={draft ?? ""} before={rules} rewrite={model.rewrite} />}
  </section>
);

export const CheckerPage = ({ post = "", draft = "", siteKey, error, rules, model }: PageState) => (
  <Shell
    title="Free DM checker | Doorbell"
    copy={!!(model && model !== "unavailable" && model.rewrite)}
    swap={!!(model && model !== "unavailable" && model.rewrite)}
    description="Paste the post and your DM. Get a fit score, plain tips and a tighter version in seconds."
    head={siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
  >
    <h1 class="text-3xl">Will your DM get a reply?</h1>
    <p class="mt-3 text-lg text-muted-foreground">Paste the post and your message. Free, no sign-up.</p>
    {error && <p role="alert" class={`mt-6 ${alert}`}>{error}</p>}
    <form method="post" action="/check" class={`mt-8 space-y-6 p-5 sm:p-8 ${card}`}>
      <div>
        <label for="post" class={label}>The post you are replying to <span class="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id="post" name="post" rows={4} maxlength={10000} class={`${input} mt-1.5`}>{post}</textarea>
      </div>
      <div>
        <label for="draft" class={label}>Your DM</label>
        <textarea id="draft" name="draft" rows={6} maxlength={10000} required class={`${input} mt-1.5`}>{draft}</textarea>
      </div>
      {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="check" />}
      <button type="submit" class={`${button({ variant: "default", size: "lg" })} w-full sm:w-auto`}>Check my DM</button>
    </form>
    {(rules || model) && <Results rules={rules} model={model} draft={draft} />}
  </Shell>
);

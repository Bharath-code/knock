/** @jsxImportSource hono/jsx */
import { alert, button, card, input, label, notice } from "../shared/ui";
import { Shell } from "./door-pages";
import { TAGS, type FeedbackRow } from "./feedback";

const TAG_LABEL = { bug: "Something is broken", request: "I want something new", confusion: "I'm confused" } as const;

export const FeedbackPage = ({ siteKey, error, sent, page = "", body = "", contact = "", tag = "bug" }: { siteKey?: string; error?: string; sent?: boolean; page?: string; body?: string; contact?: string; tag?: string }) => (
  <Shell
    title="Talk to Bharath | Doorbell"
    description="Tell the founder what broke, what you want or what confused you."
    head={<><meta name="robots" content="noindex, nofollow" />{siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}</>}
  >
    <h1 class="text-3xl">Talk to Bharath</h1>
    <p class="mt-3 text-lg text-muted-foreground">I built Doorbell and I read every message. I reply within 24 hours during the test.</p>
    {sent && <p role="status" class={`mt-6 ${notice}`}>Thanks, I got it. If you left an email I'll write back there.</p>}
    {error && <p role="alert" class={`mt-6 ${alert}`}>{error}</p>}
    {!sent && (
      <form method="post" action="/feedback" class={`mt-8 space-y-6 p-5 sm:p-8 ${card}`}>
        <input type="hidden" name="page" value={page} />
        <fieldset>
          <legend class={label}>What is it?</legend>
          <div class="mt-2 space-y-2">
            {TAGS.map((t) => (
              <label class="flex items-center gap-2 text-sm">
                <input type="radio" name="tag" value={t} checked={t === tag} required /> {TAG_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label for="body" class={label}>Tell me</label>
          <textarea id="body" name="body" rows={5} maxlength={2000} required class={`${input} mt-1.5`}>{body}</textarea>
        </div>
        <div>
          <label for="contact" class={label}>Your email <span class="font-normal text-muted-foreground">(optional, only if you want a reply)</span></label>
          <input id="contact" name="contact" type="email" maxlength={200} autocomplete="email" value={contact} class={`${input} mt-1.5`} />
        </div>
        {siteKey && <div class="cf-turnstile" data-sitekey={siteKey} data-action="feedback" />}
        <button type="submit" class={`${button({ variant: "default", size: "lg" })} w-full sm:w-auto`}>Send</button>
      </form>
    )}
  </Shell>
);

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export const FeedbackAdminPage = ({ rows, cleared }: { rows: FeedbackRow[]; cleared?: number }) => {
  const fresh = rows.filter((r) => r.reviewed_at === null);
  return (
    <Shell title="Feedback | Doorbell" description="Private feedback log." wide head={<meta name="robots" content="noindex, nofollow" />}>
      <h1 class="text-3xl">Feedback</h1>
      <p class="mt-3 text-muted-foreground">Private. {fresh.length} to review, {TAGS.map((t) => `${fresh.filter((r) => r.tag === t).length} ${t}`).join(", ")}.</p>
      {cleared !== undefined && <p role="status" class={`mt-4 ${notice}`}>Marked {cleared} as reviewed.</p>}
      {fresh.length > 0 && (
        <form method="post" action="/admin/feedback" class="mt-4">
          <button type="submit" class={button({ variant: "outline" })}>Mark all reviewed</button>
        </form>
      )}
      <ul class="mt-8 space-y-4">
        {rows.length === 0 && <li class="text-muted-foreground">Nothing yet.</li>}
        {rows.map((r) => (
          <li class={`p-5 ${card} ${r.reviewed_at ? "opacity-60" : ""}`}>
            <p class="text-sm text-muted-foreground">
              <span class="font-medium text-foreground">{r.tag}</span> · {when(r.at)}{r.page ? ` · ${r.page}` : ""}{r.reviewed_at ? " · reviewed" : ""}
            </p>
            <p class="mt-2 whitespace-pre-wrap">{r.body}</p>
            {r.contact && <p class="mt-2 text-sm">Reply to: <a href={`mailto:${r.contact}`}>{r.contact}</a></p>}
          </li>
        ))}
      </ul>
    </Shell>
  );
};

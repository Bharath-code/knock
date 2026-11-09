/** @jsxImportSource hono/jsx */
import { button, card, dot, pill } from "../shared/ui";
import { GUIDES, type Guide } from "../shared/seo";
import { Shell } from "./door-pages";

export const GuidePage = ({ guide, origin }: { guide: Guide; origin: string }) => {
  const url = `${origin}/guides/${guide.slug}`;
  const head = (
    <>
      <link rel="canonical" href={url} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={guide.title} />
      <meta property="og:description" content={guide.description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:card" content="summary" />
    </>
  );
  return (
    <Shell title={`${guide.title} | Doorbell`} description={guide.description} head={head}>
      <p><a href="/guides" class={`${pill("brand")} no-underline hover:text-foreground`}>All guides</a></p>
      <h1 class="mt-3 text-3xl">{guide.title}</h1>
      <p class="mt-3 text-lg text-muted-foreground">{guide.intro}</p>
      <h2 class="mt-10 text-xl">What to put in the DM</h2>
      <ol class="mt-4 space-y-3">
        {guide.steps.map((s, i) => (
          <li class="flex gap-3">
            <span aria-hidden="true" class="grid size-6 shrink-0 place-content-center rounded-md bg-brass-soft text-xs font-semibold text-brass-ink tabular">{i + 1}</span>
            <span class="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <h2 class="mt-10 text-xl">A sample message</h2>
      <figure class={`mt-4 p-5 ${card}`}>
        <figcaption class={pill("yes")}><span class={dot("yes")} />Gets answered</figcaption>
        <blockquote class="mt-3 leading-relaxed">{guide.example}</blockquote>
      </figure>
      <h2 class="mt-10 text-xl">A mistake to avoid</h2>
      <p class="mt-4 rounded-lg bg-no-soft px-5 py-4 text-sm ring-1 ring-inset ring-destructive/20">{guide.mistake}</p>
      <div class={`mt-12 p-5 sm:p-8 ${card}`}>
        <h2 class="text-xl">Check your DM before you send it</h2>
        <p class="mt-2 text-muted-foreground">Paste your draft and get five quick checks, free and with no account.</p>
        <div class="mt-5 flex flex-wrap gap-3">
          <a href="/check" class={button({ size: "lg" })}>Check my DM</a>
          <a href="/new" class={button({ variant: "outline", size: "lg" })}>Make your own door</a>
        </div>
      </div>
    </Shell>
  );
};

const ARROW = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground transition-transform duration-(--d-fast) group-hover:translate-x-0.5 group-hover:text-brass-ink" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export const GuidesIndex = ({ origin }: { origin: string }) => (
  <Shell title="Referral post DM guides | Doorbell" description="How to answer a referral post on X, for ten roles, with sample messages." head={<link rel="canonical" href={`${origin}/guides`} />}>
    <h1 class="text-3xl">How to apply to a referral post on X</h1>
    <p class="mt-3 text-lg text-muted-foreground">Pick your role. Then <a href="/check">check your DM</a> before you send it.</p>
    <ul class={`mt-10 divide-y ${card}`}>
      {GUIDES.map((x) => (
        <li>
          <a href={`/guides/${x.slug}`} class="group flex items-center justify-between gap-4 px-5 py-4 text-foreground no-underline transition-colors hover:bg-muted/50 hover:text-foreground">
            <span class="min-w-0"><span class="block font-medium first-letter:uppercase">{x.role}</span><span class="block text-sm text-muted-foreground">{x.title}</span></span>
            {ARROW}
          </a>
        </li>
      ))}
    </ul>
  </Shell>
);

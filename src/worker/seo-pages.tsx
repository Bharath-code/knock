/** @jsxImportSource hono/jsx */
import { button, card } from "../shared/ui";
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
      <p class="text-sm"><a href="/guides">All guides</a></p>
      <h1 class="mt-3 text-3xl">{guide.title}</h1>
      <p class="mt-3 text-lg text-muted-foreground">{guide.intro}</p>
      <h2 class="mt-10 text-xl">What to put in the DM</h2>
      <ol class="mt-4 list-decimal space-y-2 pl-5 text-muted-foreground">{guide.steps.map((s) => <li>{s}</li>)}</ol>
      <h2 class="mt-10 text-xl">A sample message</h2>
      <blockquote class={`mt-4 p-5 text-sm ${card}`}>{guide.example}</blockquote>
      <h2 class="mt-10 text-xl">A mistake to avoid</h2>
      <p class="mt-4 text-muted-foreground">{guide.mistake}</p>
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

export const GuidesIndex = ({ origin }: { origin: string }) => (
  <Shell title="Referral post DM guides | Doorbell" description="How to answer a referral post on X, for ten roles, with sample messages." head={<link rel="canonical" href={`${origin}/guides`} />}>
    <h1 class="text-3xl">How to apply to a referral post on X</h1>
    <p class="mt-3 text-lg text-muted-foreground">Pick your role. Then <a href="/check">check your DM</a> before you send it.</p>
    <ul class="mt-10 space-y-3">
      {GUIDES.map((x) => <li><a href={`/guides/${x.slug}`}>{x.title}</a></li>)}
    </ul>
  </Shell>
);

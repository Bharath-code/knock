/** @jsxImportSource hono/jsx */
import { CHANGELOG } from "../shared/changelog";
import { button, dot, pill, raised } from "../shared/ui";
import { Shell } from "./door-pages";

const steps = [
  ["Post your door", "Paste the post you are sharing. Doorbell gives you one link for your bio or first reply."],
  ["People knock", "Three short questions, one message. A checker nudges them toward something you can answer."],
  ["You answer in one tap", "Yes, not now, or no, from an inbox you can clear with the keyboard. Every sender hears back."],
] as const;

const kbd = "inline-grid h-5 min-w-5 place-content-center rounded border bg-muted px-1 font-mono text-xs text-muted-foreground";

// A static picture of the inbox, built from the same recipes as /app. Decorative: the copy beside it says the same thing.
const Preview = () => (
  <div aria-hidden="true" class="relative mx-auto w-full max-w-md select-none lg:mx-0">
    <div class={`absolute inset-x-6 -top-3 h-24 rotate-[-2deg] opacity-60 ${raised}`} />
    <div class={`relative p-5 ${raised}`}>
      <div class="flex items-center justify-between gap-3">
        <span class="truncate font-mono text-xs text-muted-foreground">hiring-go-engineer-pune</span>
        <span class={pill("yes")}><span class={dot("yes")} />Fit 4/5</span>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <span class={pill("brand")}>Go · 5 yrs</span>
        <span class={pill("neutral")}>Open source</span>
        <span class={pill("neutral")}>Pune</span>
      </div>
      <p class="mt-4 text-base leading-relaxed">5 years in Go, built git-scope (100+ stars). Could we talk this week?</p>
      <div class="mt-4 grid gap-px overflow-hidden rounded-lg bg-border text-sm ring-1 ring-border">
        <div class="bg-muted/50 px-4 py-2.5 dark:bg-muted/30"><p class="text-xs font-medium text-muted-foreground">Link to your work</p><p class="font-medium">github.com/example</p></div>
      </div>
      <div class="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-1.5 dark:bg-muted/40">
        <span class="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium"><span class={dot("no")} />No</span>
        <span class="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium"><span class={dot("later")} />Not now</span>
        <span class={`${button({ size: "sm" })} h-9 rounded-lg sm:h-9`}>Yes <span class={`${kbd} border-transparent bg-primary-foreground/20 text-primary-foreground`}>Y</span></span>
      </div>
    </div>
    <div class={`absolute -bottom-5 -left-3 flex items-center gap-2 px-3 py-2 text-sm sm:-left-8 ${raised}`}>
      <span class={dot("yes")} />Answered Yes · sender emailed
    </div>
  </div>
);

export const Home = () => (
  <Shell title="Doorbell: every knock gets an answer" description="A door link for your bio or first reply. People ask in three short fields, you answer in one tap." wide>
    <div aria-hidden="true" class="pointer-events-none absolute top-0 left-1/2 -z-10 h-[40rem] w-screen -translate-x-1/2 bg-[radial-gradient(60%_50%_at_70%_20%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%),radial-gradient(40%_40%_at_15%_10%,color-mix(in_oklab,var(--later)_10%,transparent),transparent_70%)]" />
    <section class="grid items-center gap-14 py-4 sm:py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      <div>
        <a href="/changelog" class={`${pill("brand")} no-underline transition-colors hover:text-foreground`}>
          <span class="rounded-full bg-button-primary px-1.5 text-primary-foreground">New</span>{CHANGELOG[0]?.title}
        </a>
        <h1 class="mt-5 text-[clamp(2.5rem,1.6rem+4vw,4.25rem)] leading-[1.02] tracking-[-0.025em]">Every knock gets an answer.</h1>
        <p class="mt-6 max-w-[34rem] text-lg text-muted-foreground sm:text-xl sm:leading-relaxed">
          A door link for your bio or first reply. People ask in three short fields, you answer in one tap, and nobody is left waiting.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a href="/new" class={button({ variant: "default", size: "lg" })}>Make a door</a>
          <a href="/check" class={button({ variant: "outline", size: "lg" })}>Try the free DM checker</a>
        </div>
        <p class="mt-4 text-sm text-muted-foreground">Free while it is being built. No sign-up.</p>
      </div>
      <Preview />
    </section>
    <section aria-labelledby="how" class="mt-20 sm:mt-28">
      <h2 id="how" class="text-xl">How it works</h2>
      <ol class="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li class={`p-5 ${raised}`}>
            <span aria-hidden="true" class="grid size-8 place-content-center rounded-lg bg-button-primary text-sm font-semibold text-primary-foreground tabular">{i + 1}</span>
            <h3 class="mt-4 text-lg">{t}</h3>
            <p class="mt-2 text-muted-foreground">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  </Shell>
);

/** @jsxImportSource hono/jsx */
import { button } from "../shared/ui";
import { Shell } from "./door-pages";

const steps = [
  ["Post your door", "Paste the post you are sharing. Doorbell gives you one link for your bio or first reply."],
  ["People knock", "Three short questions, one message. A checker nudges them toward something you can answer."],
  ["You answer in one tap", "Yes, not now, or no, from an inbox you can clear with the keyboard. Every sender hears back."],
] as const;

export const Home = () => (
  <Shell title="Doorbell: every knock gets an answer" description="A door link for your bio or first reply. People ask in three short fields, you answer in one tap." wide>
    <section class="max-w-3xl py-6 sm:py-12">
      <h1 class="text-[clamp(2.5rem,1.6rem+4vw,4.25rem)] leading-[1.02] tracking-[-0.035em]">Every knock gets an answer.</h1>
      <p class="mt-6 max-w-[34rem] text-lg text-muted sm:text-xl sm:leading-relaxed">
        A door link for your bio or first reply. People ask in three short fields, you answer in one tap, and nobody is left waiting.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a href="/new" class={button({ variant: "primary", size: "lg" })}>Make a door</a>
        <a href="/check" class={button({ size: "lg" })}>Try the free DM checker</a>
      </div>
      <p class="mt-4 text-sm text-muted">Free while it is being built. No sign-up.</p>
    </section>
    <section aria-labelledby="how" class="mt-12 border-t border-line pt-12 sm:mt-20">
      <h2 id="how" class="text-xl">How it works</h2>
      <ol class="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {steps.map(([t, d], i) => (
          <li>
            <span aria-hidden="true" class="grid size-8 place-content-center rounded-full bg-brass-soft text-sm font-semibold text-brass-ink tabular">{i + 1}</span>
            <h3 class="mt-4 text-lg">{t}</h3>
            <p class="mt-2 text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  </Shell>
);

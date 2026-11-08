/** @jsxImportSource hono/jsx */
import { card, notice } from "../shared/ui";
import { Shell } from "./door-pages";
import { TARGETS, verdict, type D1Metrics, type EventCounts, type Verdict } from "./metrics";

const fmt = (v: number | null, f: "n" | "pct" | "dec") =>
  v === null ? "–" : f === "pct" ? `${Math.round(v * 100)}%` : f === "dec" ? v.toFixed(1) : String(Math.round(v));

const BADGE: Record<Verdict, { text: string; cls: string }> = {
  met: { text: "On target", cls: "bg-yes/10 text-yes" },
  below: { text: "Below target", cls: "bg-brass-soft text-brass-ink" },
  kill: { text: "Kill signal", cls: "bg-destructive/10 text-destructive" },
  none: { text: "No data yet", cls: "bg-muted text-muted-foreground" },
};

const FUNNEL = [
  ["door_view", "Door views"],
  ["knock_start", "Knock attempts"],
  ["knock_sent", "Knocks sent"],
  ["seen", "Seen by receiver"],
  ["answered", "Answered"],
  ["yes", "Yes"],
  ["outcome", "Outcomes"],
  ["own_door_click", "Own-door clicks"],
  ["own_door_created", "Own doors created"],
] as const;

const SOURCES = ["reply", "bio", "direct"] as const;

export const MetricsPage = ({ d1, events }: { d1: D1Metrics; events: EventCounts | null }) => {
  const sum = (event: string, detail?: string) => (events ?? []).filter((e) => e.event === event && (detail === undefined || e.detail === detail)).reduce((a, e) => a + e.n, 0);
  return (
    <Shell title="Metrics | Doorbell" description="Private funnel dashboard." wide head={<meta name="robots" content="noindex, nofollow" />}>
      <h1 class="text-3xl">Metrics</h1>
      <p class="mt-3 text-muted-foreground">Private. Last 14 days unless noted.</p>

      <section class={`mt-8 p-6 ${card}`} aria-labelledby="ns">
        <h2 id="ns" class="text-sm font-medium text-muted-foreground">North Star · answered knocks, last 7 days</h2>
        <p class="mt-2 font-display text-3xl font-semibold tabular-nums">{d1.northStar}</p>
        <p class="mt-1 text-sm text-muted-foreground">Yes, Not now or No within the window. Auto-closed knocks don't count.</p>
      </section>

      <section class="mt-10" aria-labelledby="targets">
        <h2 id="targets" class="text-xl">Day-14 targets</h2>
        <ul class="mt-4 grid gap-4 sm:grid-cols-2">
          {TARGETS.map((t) => {
            const v = d1[t.key];
            const b = BADGE[verdict(v, t.goal, "kill" in t ? t.kill : undefined)];
            return (
              <li class={`flex flex-col gap-2 p-5 ${card}`}>
                <div class="flex items-start justify-between gap-3">
                  <h3 class="text-sm font-medium text-muted-foreground">{t.label}</h3>
                  <span class={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>{b.text}</span>
                </div>
                <p class="font-display text-2xl font-semibold tabular-nums">{fmt(v, t.fmt)}</p>
                <p class="text-sm text-muted-foreground">
                  Goal {fmt(t.goal, t.fmt)}{t.fmt === "n" || t.fmt === "dec" ? "+" : " or more"}
                  {"kill" in t ? ` · kill under ${t.kill}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="mt-10" aria-labelledby="funnel">
        <h2 id="funnel" class="text-xl">Funnel events</h2>
        {events === null ? (
          <p class={`mt-4 ${notice}`}>Event counts are unavailable here. They load on Cloudflare through the Analytics SQL binding, not in local dev.</p>
        ) : (
          <>
            <dl class={`mt-4 divide-y ${card}`}>
              {FUNNEL.map(([key, name]) => (
                <div class="flex items-baseline justify-between gap-4 px-5 py-3">
                  <dt>{name}</dt>
                  <dd class="font-mono tabular-nums">{sum(key)}</dd>
                </div>
              ))}
            </dl>
            <h3 class="mt-8 text-base font-semibold">Link reach by source</h3>
            <p class="mt-1 text-sm text-muted-foreground">Reply links carry ?s=reply, bio links ?s=bio. Link-preview bots are left out.</p>
            <div class={`mt-4 overflow-x-auto ${card}`}>
              <table class="w-full text-sm">
                <thead class="text-left text-muted-foreground">
                  <tr><th class="px-5 py-3 font-medium">Source</th><th class="px-5 py-3 text-right font-medium">Views</th><th class="px-5 py-3 text-right font-medium">Knocks</th><th class="px-5 py-3 text-right font-medium">View → knock</th></tr>
                </thead>
                <tbody class="divide-y">
                  {SOURCES.map((s) => {
                    const views = sum("door_view", s);
                    const sent = sum("knock_sent", s);
                    return (
                      <tr>
                        <td class="px-5 py-3">{s}</td>
                        <td class="px-5 py-3 text-right font-mono tabular-nums">{views}</td>
                        <td class="px-5 py-3 text-right font-mono tabular-nums">{sent}</td>
                        <td class="px-5 py-3 text-right font-mono tabular-nums">{views ? `${Math.round((sent / views) * 100)}%` : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </Shell>
  );
};

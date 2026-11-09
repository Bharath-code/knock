/** @jsxImportSource hono/jsx */
import { alert, dot, notice, pill, raised, type Tone } from "../shared/ui";
import { Shell } from "./door-pages";
import { TARGETS, verdict, type D1Metrics, type EventCounts, type Verdict } from "./metrics";

const fmt = (v: number | null, f: "n" | "pct" | "dec") =>
  v === null ? "–" : f === "pct" ? `${Math.round(v * 100)}%` : f === "dec" ? v.toFixed(1) : String(Math.round(v));

const BADGE: Record<Verdict, { text: string; tone: Tone }> = {
  met: { text: "On target", tone: "yes" },
  below: { text: "Below target", tone: "maybe" },
  kill: { text: "Kill signal", tone: "no" },
  none: { text: "No data yet", tone: "neutral" },
};
const Verdict = ({ v }: { v: Verdict }) => <span class={pill(BADGE[v].tone)}><span class={dot(BADGE[v].tone)} />{BADGE[v].text}</span>;

const FUNNEL = [
  ["door_view", "Door views"],
  ["knock_start", "Knock attempts"],
  ["knock_sent", "Knocks sent"],
  ["seen", "Seen by receiver"],
  ["answered", "Answered"],
  ["yes", "Yes"],
  ["pass", "Passed to another door"],
  ["outcome", "Outcomes"],
  ["own_door_click", "Own-door clicks"],
  ["own_door_created", "Own doors created"],
] as const;

const SOURCES = ["reply", "bio", "direct"] as const;

export const MetricsPage = ({ d1, events: raw }: { d1: D1Metrics; events: EventCounts | { error: string } | null }) => {
  const failed = raw && "error" in raw ? raw.error : null;
  const events = Array.isArray(raw) ? raw : null;
  const sum = (event: string, detail?: string) => (events ?? []).filter((e) => e.event === event && (detail === undefined || e.detail === detail)).reduce((a, e) => a + e.n, 0);
  return (
    <Shell title="Metrics | Doorbell" description="Private funnel dashboard." wide head={<meta name="robots" content="noindex, nofollow" />}>
      <h1 class="text-3xl">Metrics</h1>
      <p class="mt-3 text-muted-foreground">Private. Last 14 days unless noted.</p>

      <section class={`mt-8 p-6 ${raised}`} aria-labelledby="ns">
        <h2 id="ns" class="text-sm font-medium text-muted-foreground">North Star · answered knocks, last 7 days</h2>
        <p class="mt-2 font-display text-3xl font-semibold tabular-nums">{d1.northStar}</p>
        <p class="mt-1 text-sm text-muted-foreground">Yes, Not now or No within the window. Auto-closed knocks don't count.</p>
      </section>

      <section class={`mt-10 p-5 ${raised}`} aria-labelledby="fd">
        <div class="flex items-start justify-between gap-3">
          <h2 id="fd" class="text-sm font-medium text-muted-foreground">First door speed · last 5 new receivers</h2>
          <Verdict v={d1.firstDoor.n < 5 ? "none" : d1.firstDoor.fast >= 4 ? "met" : "below"} />
        </div>
        <p class="mt-2 font-display text-2xl font-semibold tabular-nums">{d1.firstDoor.n ? `${d1.firstDoor.fast} of ${d1.firstDoor.n} under 60 s` : "–"}</p>
        <p class="mt-1 text-sm text-muted-foreground">
          {d1.firstDoor.median !== null ? `Median ${Math.round(d1.firstDoor.median)} s. ` : ""}Timed from opening /new to creating the first door. Goal: 4 of 5. Needs 5 new receivers; older doors aren't timed.
        </p>
      </section>

      <section class={`mt-10 p-6 ${raised}`} aria-labelledby="pw">
        <h2 id="pw" class="text-sm font-medium text-muted-foreground">Passes per week · last 7 days</h2>
        <p class="mt-2 font-display text-3xl font-semibold tabular-nums">{d1.passes.pending + d1.passes.accepted + d1.passes.declined}</p>
        <p class="mt-1 text-sm text-muted-foreground">{d1.passes.accepted} confirmed by the sender · {d1.passes.pending} waiting · {d1.passes.declined} declined.</p>
      </section>

      <section class="mt-10" aria-labelledby="targets">
        <h2 id="targets" class="text-xl">Day-14 targets</h2>
        <ul class="mt-4 grid gap-4 sm:grid-cols-2">
          {TARGETS.map((t) => {
            const v = d1[t.key];
            const b = verdict(v, t.goal, "kill" in t ? t.kill : undefined);
            return (
              <li class={`flex flex-col gap-2 p-5 ${raised}`}>
                <div class="flex items-start justify-between gap-3">
                  <h3 class="text-sm font-medium text-muted-foreground">{t.label}</h3>
                  <Verdict v={b} />
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

      <section class={`mt-10 p-6 ${raised}`} aria-labelledby="fs">
        <h2 id="fs" class="text-sm font-medium text-muted-foreground">Doors made by former senders · all time</h2>
        <p class="mt-2 font-display text-3xl font-semibold tabular-nums">{fmt(d1.fromSenderShare, "pct")}</p>
        <p class="mt-1 text-sm text-muted-foreground">Of {d1.doors} doors. Goal 20% by day 60. Under 20% then means the network isn't forming.</p>
      </section>

      <section class="mt-10" aria-labelledby="funnel">
        <h2 id="funnel" class="text-xl">Funnel events</h2>
        {failed ? (
          <p class={`mt-4 ${alert}`} role="alert">The event query failed: {failed}</p>
        ) : events === null ? (
          <p class={`mt-4 ${notice}`}>Event counts are unavailable here. They load on Cloudflare through the Analytics SQL binding, not in local dev.</p>
        ) : (
          <>
            <dl class={`mt-4 space-y-2 p-4 sm:p-5 ${raised}`}>
              {FUNNEL.map(([key, name]) => {
                const top = Math.max(1, sum(FUNNEL[0][0]));
                const share = Math.min(100, (sum(key) / top) * 100);
                return (
                  <div class="relative isolate flex items-baseline justify-between gap-4 overflow-hidden rounded-lg px-3 py-2">
                    <span aria-hidden="true" class="absolute inset-y-0 left-0 -z-10 rounded-lg bg-brass-soft" style={`width:${share}%`} />
                    <dt class="text-sm">{name}</dt>
                    <dd class="flex items-baseline gap-3 font-mono text-sm tabular-nums">{sum(key)}<span class="w-10 text-right text-xs text-muted-foreground">{Math.round(share)}%</span></dd>
                  </div>
                );
              })}
            </dl>
            <h3 class="mt-8 text-base font-semibold">Link reach by source</h3>
            <p class="mt-1 text-sm text-muted-foreground">Reply links carry ?s=reply, bio links ?s=bio. Link-preview bots are left out.</p>
            <div class={`mt-4 overflow-x-auto ${raised}`}>
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

export const EVENTS = ["door_view", "knock_start", "knock_sent", "seen", "answered", "yes", "outcome", "own_door_click", "own_door_created"] as const;
export type FunnelEvent = (typeof EVENTS)[number];

// blob1 = event, blob2 = detail (source, ref or answer), blob3 = door id or template, double1 = how many.
// A Worker may write at most 250 points per request, so bulk actions write one point with a weight.
export const track = (funnel: AnalyticsEngineDataset, event: FunnelEvent, detail = "", extra = "", n = 1) =>
  funnel.writeDataPoint({ blobs: [event, detail, extra], doubles: [n], indexes: [event] });

// Link-preview fetchers (X cards, Slack unfurls) open every posted link and would inflate reach.
export const isBot = (ua: string | undefined) => !ua || /bot|crawl|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|embedly|headless/i.test(ua);

export const viewSource = (s: string | undefined) => (s === "reply" || s === "bio" ? s : "direct");

const DAY = 86_400_000;
export const WEEK = 7 * DAY;
export const PERIOD = 14 * DAY;

export type D1Metrics = {
  northStar: number;
  receivers: number;
  answerRate: number | null;
  knocksPerActiveDoor: number | null;
  outcomes: number;
  knocks: number;
};

// Truth comes from D1, not events: undo deletes the decision row, so nothing double-counts.
export const d1Metrics = async (db: D1Database, now = Date.now()): Promise<D1Metrics> => {
  const [ns, rec, closed, k, out] = await db.batch([
    db.prepare("SELECT COUNT(*) n FROM decisions WHERE answer IN ('yes','later','no') AND at >= ?1").bind(now - WEEK),
    db.prepare("SELECT COUNT(DISTINCT owner_user_id) n FROM doors"),
    db.prepare("SELECT COUNT(*) total, COALESCE(SUM(answer <> 'expired'), 0) answered FROM decisions WHERE answer IN ('yes','later','no','expired') AND at >= ?1").bind(now - PERIOD),
    db.prepare("SELECT COUNT(*) knocks, COUNT(DISTINCT door_id) doors FROM knocks WHERE created_at >= ?1").bind(now - PERIOD),
    db.prepare("SELECT COUNT(*) n FROM outcomes WHERE at >= ?1").bind(now - PERIOD),
  ]);
  const one = <T,>(r: unknown) => ((r as D1Result<T>).results[0] ?? {}) as T;
  const c = one<{ total: number; answered: number }>(closed);
  const kk = one<{ knocks: number; doors: number }>(k);
  return {
    northStar: one<{ n: number }>(ns).n ?? 0,
    receivers: one<{ n: number }>(rec).n ?? 0,
    answerRate: c.total ? c.answered / c.total : null,
    knocksPerActiveDoor: kk.doors ? kk.knocks / kk.doors : null,
    outcomes: one<{ n: number }>(out).n ?? 0,
    knocks: kk.knocks ?? 0,
  };
};

// Launch + 14 days go/kill targets from the PRD.
export const TARGETS = [
  { key: "receivers", label: "Receivers with a door", goal: 10, kill: 3, fmt: "n" },
  { key: "answerRate", label: "Answer rate within window", goal: 0.8, fmt: "pct" },
  { key: "knocksPerActiveDoor", label: "Knocks per active door", goal: 5, fmt: "dec" },
  { key: "outcomes", label: "Yes that reached an outcome", goal: 1, fmt: "n" },
] as const satisfies readonly { key: keyof D1Metrics; label: string; goal: number; kill?: number; fmt: "n" | "pct" | "dec" }[];

export type Verdict = "met" | "kill" | "below" | "none";
export const verdict = (v: number | null, goal: number, kill?: number): Verdict =>
  v === null ? "none" : v >= goal ? "met" : kill !== undefined && v < kill ? "kill" : "below";

export type EventCounts = { event: string; detail: string; n: number }[];

type AnalyticsSql = { query(q: { query: string; params?: unknown }): Promise<{ data: Record<string, unknown>[] }> };

// null = no binding (local dev); { error } = the query itself failed, so the page never mistakes one for the other.
export const eventCounts = async (sql: AnalyticsSql | undefined, dataset: string | undefined): Promise<EventCounts | { error: string } | null> => {
  if (!sql || !dataset) return null;
  if (!/^[a-z0-9_]+$/.test(dataset)) return { error: "FUNNEL_DATASET is not a plain dataset name." };
  try {
    const { data } = await sql.query({
      query: `SELECT blob1, blob2, SUM(double1) AS n FROM events.analyticsEngine.${dataset}
              WHERE timestamp >= NOW() - INTERVAL '14' DAY GROUP BY blob1, blob2`,
    });
    return data.map((r) => ({ event: String(r.blob1), detail: String(r.blob2 ?? ""), n: Number(r.n) }));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("funnel query failed", error);
    return { error };
  }
};

export const isAdmin = (email: string | undefined | null, admins: string | undefined) =>
  !!email && !!admins && admins.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

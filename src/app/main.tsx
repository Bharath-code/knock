import { hc } from "hono/client";
import { DoorClosed, ExternalLink, Inbox as InboxIcon, Settings as SettingsIcon, Undo2, X } from "lucide-react";
import { StrictMode, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { closureMessage } from "../shared/closure";
import { CLOSE_MESSAGE, keyAction, NOTE_MAX, REASONS, POLL_MS, safeProof, sortCards, swipeAnswer, UNDO_MS, type InboxAnswer, type InboxCard, type Reason } from "../shared/inbox";
import type { Pool } from "../shared/codes";
import { card as cardBox, hint, label } from "../shared/ui";
import type { Api } from "../worker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogTrigger } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Input, Select, Textarea } from "./ui/field";
import "../styles/theme.css";

const api = hc<Api>("/api");
const LABEL: Record<InboxAnswer, string> = { yes: "Yes", later: "Not now", no: "No" };
const KEY: Record<InboxAnswer, string> = { yes: "Y", later: "L", no: "N" };
const DOT: Record<InboxAnswer, string> = { yes: "bg-yes", later: "bg-later", no: "bg-no" };
const DAY = 86_400_000;

const due = (at: number) => {
  const d = Math.ceil((at - Date.now()) / DAY);
  return d <= 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`;
};

const Fit = ({ fit }: { fit: number | null }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted tabular">
    <span aria-hidden className={cn("size-1.5 rounded-full", fit == null ? "bg-line-strong" : fit >= 4 ? "bg-yes" : fit === 3 ? "bg-later" : "bg-no")} />
    {fit == null ? "Not scored" : `Fit ${fit}/5`}
  </span>
);

const Tag = ({ tone, children }: { tone?: "no"; children: ReactNode }) => (
  <li className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone === "no" ? "bg-no-soft text-no" : "bg-sunk text-muted")}>{children}</li>
);

const Card = ({ c, onAnswer }: { c: InboxCard; onAnswer: (a: InboxAnswer) => void }) => {
  const start = useRef<[number, number] | null>(null);
  const [drag, setDrag] = useState<[number, number]>([0, 0]);
  const end = (e: React.PointerEvent) => {
    if (!start.current) return;
    const a = swipeAnswer(e.clientX - start.current[0], e.clientY - start.current[1]);
    start.current = null;
    setDrag([0, 0]);
    if (a) onAnswer(a);
  };
  const proof = safeProof(c.proof);
  return (
    <article
      className={cn(cardBox, "animate-rise touch-pan-y p-5 shadow-e-2 select-none sm:p-6", !start.current && "transition-transform duration-(--d-base) ease-out")}
      style={{ transform: `translate(${drag[0]}px, ${Math.min(drag[1], 0)}px) rotate(${drag[0] / 24}deg)` }}
      onPointerDown={(e) => { if ((e.target as Element).closest("a")) return; start.current = [e.clientX, e.clientY]; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => start.current && setDrag([e.clientX - start.current[0], e.clientY - start.current[1]])}
      onPointerUp={end}
      onPointerCancel={() => { start.current = null; setDrag([0, 0]); }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="truncate font-mono text-xs text-muted">{c.door}</p>
        <p className="flex items-center gap-3 text-xs text-muted"><Fit fit={c.fit} /><span className="tabular">{due(c.expiresAt)}</span></p>
      </header>
      <p className="mt-4 text-lg whitespace-pre-line">{c.message}</p>
      {c.answers.length > 0 && (
        <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
          {c.answers.map((x) => (
            <div key={x.q}><dt className="text-muted">{x.q}</dt><dd className="mt-0.5 break-words">{x.a}</dd></div>
          ))}
        </dl>
      )}
      {proof && (
        <a className="mt-4 inline-flex max-w-full items-center gap-1.5 text-sm" href={proof} target="_blank" rel="noreferrer noopener">
          <span className="truncate">{proof.replace(/^https?:\/\//, "")}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </a>
      )}
      {(c.spam || c.rewrote) && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {c.spam && <Tag tone="no">Possible spam</Tag>}
          {c.rewrote && <Tag>Used AI rewrite</Tag>}
        </ul>
      )}
    </article>
  );
};

const Section = ({ title, desc, children }: { title: string; desc: string; children: ReactNode }) => (
  <section className="grid gap-4 border-t border-line py-8 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-8">
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

const App = () => {
  const [path, setPath] = useState(location.pathname);
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [i, setI] = useState(0);
  const [gate, setGate] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<Reason | undefined>();
  const [note, setNote] = useState("");
  const [info, setInfo] = useState("");
  const [needCodes, setNeedCodes] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [booking, setBooking] = useState("");
  const [account, setAccount] = useState<{ email: string | null; handle: string | null } | null>(null);
  const [emailIn, setEmailIn] = useState("");
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolDoor, setPoolDoor] = useState("");
  const [codeText, setCodeText] = useState("");
  const [undo, setUndo] = useState<{ card: InboxCard; a: InboxAnswer; index: number } | null>(null);
  const settings = path.startsWith("/app/settings");

  useEffect(() => {
    const f = () => setPath(location.pathname);
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const go = (p: string) => (e?: MouseEvent) => {
    e?.preventDefault();
    history.pushState(null, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  };

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try { await fn(); } finally { setBusy(null); }
  };

  useEffect(() => {
    api.inbox.$get().then(async (r) => {
      if (r.status === 401) return setGate(true);
      setCards((await r.json()) as InboxCard[]);
    }).catch(() => setError("Couldn't load your inbox. Check your connection and reload."));
  }, []);

  useEffect(() => {
    api.inbox.booking.$get().then(async (r) => r.ok && setBooking((await r.json()).url ?? "")).catch(() => {});
  }, []);

  useEffect(() => {
    api.inbox.account.$get().then(async (r) => r.ok && setAccount(await r.json())).catch(() => {});
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);

  const signOut = (all: boolean) => run(all ? "out-all" : "out", async () => {
    setError("");
    const r = await api.inbox.signout.$post({ json: { all } }).catch(() => null);
    if (!r?.ok) return setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't sign you out.");
    location.href = "/signin";
  });

  const sendEmail = () => run("email", async () => {
    setError("");
    const r = await api.inbox.email.$post({ json: { email: emailIn } }).catch(() => null);
    if (!r?.ok) return setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't send the link.");
    setInfo("Check your email and open the link to confirm it.");
  });

  const loadPools = useCallback(async () => {
    const r = await api.inbox.codes.$get().catch(() => null);
    if (!r?.ok) return;
    const p = (await r.json()) as Pool[];
    setPools(p);
    setPoolDoor((d) => d || p[0]?.doorId || "");
  }, []);
  useEffect(() => { void loadPools(); }, [loadPools]);

  const addCodes = () => run("codes", async () => {
    setError("");
    const r = await api.inbox.codes.$post({ json: { doorId: poolDoor, text: codeText } }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { added?: number; skipped?: number; error?: string } | null;
    if (!r?.ok) return setError(body?.error ?? "Couldn't save your codes.");
    setCodeText("");
    setNeedCodes(false);
    setInfo(`Added ${body?.added ?? 0} ${body?.added === 1 ? "code" : "codes"}${body?.skipped ? `, skipped ${body.skipped} already in the pool` : ""}.`);
    void loadPools();
  });

  const saveBooking = () => run("booking", async () => {
    setError("");
    const r = await api.inbox.booking.$put({ json: { url: booking } }).catch(() => null);
    if (!r?.ok) return setError(r?.status === 400 ? "Use an https link on cal.com or calendly.com." : "Couldn't save your booking link.");
    setBooking((await r.json()).url ?? "");
    setInfo(booking.trim() ? "Booking link saved. Senders you say Yes to will get it." : "Booking link removed.");
  });

  const cardsRef = useRef<InboxCard[]>([]);
  const iRef = useRef(0);
  const answered = useRef(new Set<string>());
  cardsRef.current = cards ?? [];
  iRef.current = i;
  const loaded = cards !== null;

  useEffect(() => {
    if (!loaded) return;
    let stop = false;
    let ids: string[] = [];
    const socks = new Map<string, WebSocket>();
    let running = false;
    let again = false;
    const refresh = async () => {
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          const r = await api.inbox.$get().catch(() => null);
          if (!r?.ok || stop) return;
          const cur = cardsRef.current;
          const have = new Set(cur.map((c) => c.id));
          const fresh = ((await r.json()) as InboxCard[]).filter((c) => !have.has(c.id) && !answered.current.has(c.id));
          if (!fresh.length) continue;
          const curId = cur[iRef.current]?.id;
          const merged = sortCards([...cur, ...fresh]);
          const at = Math.max(0, merged.findIndex((c) => c.id === curId));
          cardsRef.current = merged;
          iRef.current = at;
          setCards(merged);
          setI(at);
          setInfo("");
        } while (again);
      } finally {
        running = false;
      }
    };
    const connect = (id: string) => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/inbox-live/${id}`);
      socks.set(id, ws);
      ws.onmessage = () => void refresh();
      ws.onclose = ws.onerror = () => { if (socks.get(id) === ws) socks.delete(id); };
    };
    let first = true;
    const tick = async () => {
      const r = await api.inbox.doors.$get().catch(() => null);
      if (r?.ok && !stop) ids = await r.json();
      const down = ids.filter((id) => socks.get(id)?.readyState !== WebSocket.OPEN);
      if (!first && (down.length || !ids.length)) void refresh();
      first = false;
      for (const id of down) if (!socks.has(id)) connect(id);
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { stop = true; clearInterval(timer); socks.forEach((w) => w.close()); };
  }, [loaded]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const answer = useCallback(async (a: InboxAnswer) => {
    const card = cards?.[i];
    if (!card) return;
    const extra = { reason, note: note.trim() || undefined };
    setReason(undefined);
    setNote("");
    setError("");
    answered.current.add(card.id);
    setCards((cs) => cs!.filter((x) => x.id !== card.id));
    setI((n) => Math.max(0, Math.min(n, (cards?.length ?? 1) - 2)));
    const r = await api.inbox[":id"].answer.$post({ param: { id: card.id }, json: { answer: a, ...extra } }).catch(() => null);
    if (r?.ok) {
      const { code } = (await r.json()) as { code?: string };
      if (code === "empty") {
        setInfo("That door is out of invite codes. The sender gets your booking link instead.");
        setNeedCodes(true);
      }
      if (a === "yes") void loadPools();
      return setUndo({ card, a, index: i });
    }
    answered.current.delete(card.id);
    setCards((cs) => [...cs!.slice(0, i), card, ...cs!.slice(i)]);
    setReason(extra.reason);
    setNote(extra.note ?? "");
    setError(r?.status === 409 ? "That knock was already answered." : "Couldn't save your answer. Try again.");
  }, [cards, i, reason, note, loadPools]);

  const undoLast = useCallback(async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    const r = await api.inbox[":id"].undo.$post({ param: { id: u.card.id } }).catch(() => null);
    if (r?.ok) { void loadPools(); answered.current.delete(u.card.id); setCards((cs) => [...cs!.slice(0, u.index), u.card, ...cs!.slice(u.index)]); setI(u.index); }
    else setError("Too late to undo.");
  }, [undo]);

  const closeRest = () => run("close", async () => {
    setError("");
    const r = await api.inbox["close-rest"].$post().catch(() => null);
    if (!r?.ok) return setError("Couldn't close your knocks. Nothing was changed.");
    const { closed } = await r.json();
    setCards([]);
    setUndo(null);
    setInfo(`Closed ${closed} ${closed === 1 ? "knock" : "knocks"}. Each sender was emailed.`);
  });

  useEffect(() => {
    if (settings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as Element | null)?.closest?.("input, textarea, select, [role=dialog]")) return;
      const k = keyAction(e.key);
      if (!k) return;
      if (k.type === "move") setI((n) => Math.max(0, Math.min(n + k.by, (cards?.length ?? 1) - 1)));
      else if (k.type === "answer") void answer(k.answer);
      else void undoLast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, answer, undoLast, settings]);

  const card = cards?.[i];
  const open = cards?.length ?? 0;
  const tab = "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted no-underline transition-colors duration-(--d-fast) hover:bg-sunk hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink";

  const inbox = gate ? (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <DoorClosed className="mx-auto size-8 text-muted" aria-hidden />
      <h1 className="mt-4 text-2xl">No inbox on this device</h1>
      <p className="mt-2 text-muted">Make a door to start getting knocks, or sign in if you already have one.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild variant="primary"><a href="/new">Make a door</a></Button>
        <Button asChild><a href="/signin">Sign in</a></Button>
      </div>
    </div>
  ) : cards === null ? (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_1fr] lg:py-10" aria-busy="true">
      <div className="hidden space-y-2 lg:block">{[0, 1, 2].map((n) => <div key={n} className="h-16 animate-pulse rounded-md bg-sunk" />)}</div>
      <div className="h-64 animate-pulse rounded-lg bg-sunk" />
    </div>
  ) : !card ? (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <InboxIcon className="mx-auto size-8 text-muted" aria-hidden />
      <h1 className="mt-4 text-2xl">{undo ? "All answered" : "No knocks yet"}</h1>
      <p className="mt-2 text-muted">Post your door link as the first reply under your post. New knocks show up here live.</p>
    </div>
  ) : (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:py-10">
      <aside className="hidden lg:block" aria-label="Open knocks">
        <p className="px-3 text-xs font-medium text-muted">Open <span className="tabular">{open}</span> · best fit first</p>
        <ul className="mt-2 space-y-0.5">
          {cards.map((c, n) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-current={n === i || undefined}
                className="w-full cursor-pointer rounded-md px-3 py-2.5 text-left transition-colors duration-(--d-fast) hover:bg-sunk aria-[current=true]:bg-card aria-[current=true]:shadow-e-1 aria-[current=true]:ring-1 aria-[current=true]:ring-line"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-muted">{c.door}</span>
                  <Fit fit={c.fit} />
                </span>
                <span className="mt-1 line-clamp-2 text-sm">{c.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl">Inbox</h1>
          <p className="text-sm text-muted tabular" aria-live="polite">{i + 1} of {open}</p>
        </div>
        <div className="mt-4"><Card key={card.id} c={card} onAnswer={answer} /></div>

        <div className={cn(cardBox, "mt-4 p-5 sm:p-6")}>
          <fieldset>
            <legend className={label}>Reason <span className="font-normal text-muted">(optional)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(REASONS) as Reason[]).map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(reason === r ? undefined : r)}
                  className="h-11 cursor-pointer rounded-full border border-line px-3.5 text-sm text-muted transition-colors duration-(--d-fast) hover:border-line-strong hover:text-ink aria-pressed:border-brass aria-pressed:bg-brass-soft aria-pressed:text-brass-ink sm:h-9">
                  {REASONS[r]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="note" className={label}>Message to sender <span className="font-normal text-muted">(optional)</span></label>
              <span className="font-mono text-xs text-muted tabular">{note.length}/{NOTE_MAX}</span>
            </div>
            <Textarea id="note" value={note} maxLength={NOTE_MAX} rows={2} placeholder="Leave empty to send the default" onChange={(e) => setNote(e.target.value)} className="mt-1.5" />
            <details className="group mt-2 text-sm">
              <summary className="cursor-pointer text-muted transition-colors hover:text-ink">See the default messages</summary>
              <dl className="mt-2 space-y-2 text-muted">
                <div><dt className="font-medium text-ink">No</dt><dd>{closureMessage(card.template, "no")}</dd></div>
                <div><dt className="font-medium text-ink">Not now</dt><dd>{closureMessage(card.template, "later")}</dd></div>
              </dl>
            </details>
          </div>
        </div>
        <div className="sticky bottom-3 z-10 mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-card/90 p-2 shadow-e-2 backdrop-blur-md">
          {(["no", "later", "yes"] as const).map((a) => (
            <Button key={a} variant={a === "yes" ? "primary" : "ghost"} className={a === "yes" ? "" : "text-ink"} onClick={() => void answer(a)}>
              {a !== "yes" && <span aria-hidden className={cn("size-2 rounded-full", DOT[a])} />}
              {LABEL[a]}
              <kbd className="hidden sm:inline" aria-hidden>{KEY[a]}</kbd>
            </Button>
          ))}
        </div>
        <p className="mt-4 hidden text-center text-xs text-muted lg:block">
          <kbd>J</kbd> <kbd>K</kbd> move · <kbd>U</kbd> undo · swipe on touch
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <a href="/" className="mr-2 inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink no-underline hover:text-ink">
            <DoorClosed className="size-5 text-brass" aria-hidden />
            <span className="hidden sm:inline">Doorbell</span>
          </a>
          <nav className="flex items-center gap-1">
            <a href="/app" onClick={go("/app")} aria-current={!settings ? "page" : undefined} className={tab}>
              Inbox{open > 0 && <span className="rounded-full bg-brass px-1.5 text-xs leading-5 text-on-accent tabular">{open}</span>}
            </a>
            <a href="/app/settings" onClick={go("/app/settings")} aria-current={settings ? "page" : undefined} className={tab}>
              <SettingsIcon className="size-4" aria-hidden />Settings
            </a>
          </nav>
          {!settings && open > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="ml-auto" busy={busy === "close"}>Close all</Button>
              </AlertDialogTrigger>
              <AlertDialogContent title={`Close ${open} open ${open === 1 ? "knock" : "knocks"}?`} description="Each sender gets this message by email. This can't be undone.">
                <blockquote className="mt-4 rounded-md bg-sunk px-4 py-3 text-sm">{CLOSE_MESSAGE}</blockquote>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void closeRest()}>Close all</AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      {info && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <p role="status" className="flex items-start gap-3 rounded-md border border-line bg-card px-4 py-3 text-sm shadow-e-1">
            <span className="flex-1">
              {info}
              {needCodes && !settings && <> <a href="/app/settings" onClick={go("/app/settings")}>Add codes</a></>}
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => { setInfo(""); setNeedCodes(false); }} className="-m-1 cursor-pointer rounded p-1 text-muted transition-colors hover:text-ink"><X className="size-4" /></button>
          </p>
        </div>
      )}

      <main>
        {settings ? (
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
            <h1 className="text-2xl">Settings</h1>
            <p className="mt-1 text-muted">How Yes answers are delivered, and how you sign in.</p>
            <div className="mt-8">
              <Section title="Booking link" desc="Sent with every Yes, so the sender can book a call.">
                <label htmlFor="booking" className={label}>Cal.com or Calendly link</label>
                <Input id="booking" type="url" value={booking} maxLength={300} placeholder="https://cal.com/you/15min" onChange={(e) => setBooking(e.target.value)} className="mt-1.5" />
                <Button className="mt-3" busy={busy === "booking"} onClick={() => void saveBooking()}>Save link</Button>
              </Section>

              <Section title="Invite codes" desc="Each Yes emails one unused code to that sender. Codes never appear in your inbox.">
                {pools.length === 0 ? (
                  <p className="text-sm text-muted">Make a door first. <a href="/new">Make a door</a></p>
                ) : (
                  <>
                    <label htmlFor="pool" className={label}>Door</label>
                    <Select id="pool" value={poolDoor} onChange={(e) => setPoolDoor(e.target.value)} className="mt-1.5">
                      {pools.map((p) => <option key={p.doorId} value={p.doorId}>{p.slug} · {p.free} left of {p.total}</option>)}
                    </Select>
                    <label htmlFor="codes" className={cn(label, "mt-4")}>Codes, one per line</label>
                    <Textarea id="codes" value={codeText} rows={4} onChange={(e) => setCodeText(e.target.value)} className="mt-1.5 font-mono text-sm" />
                    <label className={cn(hint, "block")}>
                      Or choose a CSV:{" "}
                      <input type="file" accept=".csv,.txt,text/csv,text/plain" className="mt-1 block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-card file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-sunk" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCodeText(await f.text()); }} />
                    </label>
                    <Button className="mt-4" variant="primary" disabled={!codeText.trim()} busy={busy === "codes"} onClick={() => void addCodes()}>Add codes</Button>
                  </>
                )}
              </Section>

              <Section title="Email and sign-in" desc="Use your email to sign in on other devices and get a daily digest.">
                {account?.email ? (
                  <>
                    <p className="text-sm">Signed in as <strong className="font-medium">{account.email}</strong>.</p>
                    <p className={hint}>To sign in on another device, open <a href="/signin">/signin</a> there.</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button busy={busy === "out"} onClick={() => void signOut(false)}>Sign out</Button>
                      <Button variant="danger-outline" busy={busy === "out-all"} onClick={() => void signOut(true)}>Sign out everywhere</Button>
                    </div>
                    <p className={hint}>Everywhere signs out every device, including older links from before you added an email.</p>
                  </>
                ) : (
                  <>
                    <label htmlFor="email" className={label}>Email</label>
                    <Input id="email" type="email" value={emailIn} maxLength={254} autoComplete="email" onChange={(e) => setEmailIn(e.target.value)} className="mt-1.5" />
                    <Button className="mt-3" variant="primary" disabled={!emailIn.trim()} busy={busy === "email"} onClick={() => void sendEmail()}>Send confirmation link</Button>
                  </>
                )}
              </Section>
            </div>
          </div>
        ) : inbox}
      </main>

      <div className="pointer-events-none fixed inset-x-4 top-[4.25rem] z-40 flex flex-col items-center gap-2">
        {error && (
          <p role="alert" className="pointer-events-auto flex w-full max-w-md animate-rise items-start gap-3 rounded-lg bg-no px-4 py-3 text-sm text-on-accent shadow-e-2">
            <span className="flex-1">{error}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setError("")} className="-m-1 cursor-pointer rounded p-1 opacity-80 transition-opacity hover:opacity-100"><X className="size-4" /></button>
          </p>
        )}
        {undo && (
          <div role="status" className="pointer-events-auto flex w-full max-w-md animate-rise items-center justify-between gap-3 rounded-lg bg-ink py-1.5 pr-1.5 pl-4 text-sm text-paper shadow-e-2">
            <span>Answered <strong className="font-medium">{LABEL[undo.a]}</strong></span>
            <button type="button" onClick={() => void undoLast()} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md px-3 font-medium transition-colors hover:bg-paper/10">
              <Undo2 className="size-4" aria-hidden />Undo <kbd className="hidden sm:inline">U</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

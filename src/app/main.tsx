import { cn } from "cn";
import { hc } from "hono/client";
import { DoorClosed, ExternalLink, Inbox as InboxIcon, Settings as SettingsIcon } from "lucide-react";
import { StrictMode, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { closureMessage } from "../shared/closure";
import { CLOSE_MESSAGE, keyAction, NOTE_MAX, REASONS, POLL_MS, safeProof, sortCards, swipeAnswer, UNDO_MS, type InboxAnswer, type InboxCard, type Reason } from "../shared/inbox";
import type { Pool } from "../shared/codes";
import { card as cardBox } from "../shared/ui";
import type { Api } from "../worker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Kbd } from "./ui/kbd";
import { Label } from "./ui/label";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Skeleton } from "./ui/skeleton";
import { Toaster } from "./ui/sonner";
import { Spinner } from "./ui/spinner";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import "../styles/theme.css";

const api = hc<Api>("/api");
const LABEL: Record<InboxAnswer, string> = { yes: "Yes", later: "Not now", no: "No" };
const KEY: Record<InboxAnswer, string> = { yes: "Y", later: "L", no: "N" };
const DOT: Record<InboxAnswer, string> = { yes: "bg-yes", later: "bg-later", no: "bg-destructive" };
const DAY = 86_400_000;
const fail = (m: string) => toast.error(m);

const due = (at: number) => {
  const d = Math.ceil((at - Date.now()) / DAY);
  return d <= 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`;
};

const Fit = ({ fit }: { fit: number | null }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular">
    <span aria-hidden className={cn("size-1.5 rounded-full", fit == null ? "bg-input" : fit >= 4 ? "bg-yes" : fit === 3 ? "bg-later" : "bg-destructive")} />
    {fit == null ? "Not scored" : `Fit ${fit}/5`}
  </span>
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
        <p className="truncate font-mono text-xs text-muted-foreground">{c.door}</p>
        <p className="flex items-center gap-3 text-xs text-muted-foreground"><Fit fit={c.fit} /><span className="tabular">{due(c.expiresAt)}</span></p>
      </header>
      <p className="mt-4 text-lg whitespace-pre-line">{c.message}</p>
      {c.answers.length > 0 && (
        <dl className="mt-5 space-y-3 border-t pt-4 text-sm">
          {c.answers.map((x) => (
            <div key={x.q}><dt className="text-muted-foreground">{x.q}</dt><dd className="mt-0.5 break-words">{x.a}</dd></div>
          ))}
        </dl>
      )}
      {proof && (
        <a className="mt-4 inline-flex max-w-full items-center gap-1.5 text-sm" href={proof} target="_blank" rel="noreferrer noopener">
          <span className="truncate">{proof.replace(/^https?:\/\//, "")}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden />
        </a>
      )}
      {(c.spam || c.rewrote) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {c.spam && <Badge variant="destructive">Possible spam</Badge>}
          {c.rewrote && <Badge variant="secondary">Used AI rewrite</Badge>}
        </div>
      )}
    </article>
  );
};

const Section = ({ title, desc, children }: { title: string; desc: string; children: ReactNode }) => (
  <section className="grid gap-4 border-t py-8 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-8">
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
    <div className="min-w-0 space-y-3">{children}</div>
  </section>
);

const Field = ({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) => (
  <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>
);

const App = () => {
  const [path, setPath] = useState(location.pathname);
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [i, setI] = useState(0);
  const [gate, setGate] = useState(false);
  const [reason, setReason] = useState<Reason | undefined>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [booking, setBooking] = useState("");
  const [account, setAccount] = useState<{ email: string | null; handle: string | null; digest: boolean } | null>(null);
  const [emailIn, setEmailIn] = useState("");
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolDoor, setPoolDoor] = useState("");
  const [codeText, setCodeText] = useState("");
  const undo = useRef<{ card: InboxCard; index: number; t: ReturnType<typeof setTimeout> } | null>(null);
  const settings = path.startsWith("/app/settings");

  useEffect(() => {
    const f = () => setPath(location.pathname);
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const navigate = useCallback((p: string) => {
    history.pushState(null, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  }, []);
  const go = (p: string) => (e: MouseEvent) => { e.preventDefault(); navigate(p); };

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try { await fn(); } finally { setBusy(null); }
  };
  const Busy = ({ k }: { k: string }) => (busy === k ? <Spinner /> : null);

  useEffect(() => {
    api.inbox.$get().then(async (r) => {
      if (r.status === 401) return setGate(true);
      setCards((await r.json()) as InboxCard[]);
    }).catch(() => fail("Couldn't load your inbox. Check your connection and reload."));
  }, []);

  useEffect(() => {
    api.inbox.booking.$get().then(async (r) => r.ok && setBooking((await r.json()).url ?? "")).catch(() => {});
  }, []);

  useEffect(() => {
    api.inbox.account.$get().then(async (r) => r.ok && setAccount(await r.json())).catch(() => {});
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) api.inbox.prefs.$put({ json: { tz } }).catch(() => {});
  }, []);

  const setDigest = (on: boolean) => run("digest", async () => {
    const r = await api.inbox.prefs.$put({ json: { digest: on } }).catch(() => null);
    if (!r?.ok) return fail("Couldn't save your digest setting.");
    setAccount((a) => a && { ...a, digest: on });
    toast.success(on ? "Daily digest on. It arrives around 8:00 your time on days with new knocks." : "Daily digest off.");
  });

  const signOut = (all: boolean) => run(all ? "out-all" : "out", async () => {
    const r = await api.inbox.signout.$post({ json: { all } }).catch(() => null);
    if (!r?.ok) return fail(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't sign you out.");
    location.href = "/signin";
  });

  const sendEmail = () => run("email", async () => {
    const r = await api.inbox.email.$post({ json: { email: emailIn } }).catch(() => null);
    if (!r?.ok) return fail(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't send the link.");
    toast.success("Check your email and open the link to confirm it.");
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
    const r = await api.inbox.codes.$post({ json: { doorId: poolDoor, text: codeText } }).catch(() => null);
    const body = (await r?.json().catch(() => null)) as { added?: number; skipped?: number; error?: string } | null;
    if (!r?.ok) return fail(body?.error ?? "Couldn't save your codes.");
    setCodeText("");
    toast.success(`Added ${body?.added ?? 0} ${body?.added === 1 ? "code" : "codes"}${body?.skipped ? `, skipped ${body.skipped} already in the pool` : ""}.`);
    void loadPools();
  });

  const saveBooking = () => run("booking", async () => {
    const r = await api.inbox.booking.$put({ json: { url: booking } }).catch(() => null);
    if (!r?.ok) return fail(r?.status === 400 ? "Use an https link on cal.com or calendly.com." : "Couldn't save your booking link.");
    setBooking((await r.json()).url ?? "");
    toast.success(booking.trim() ? "Booking link saved. Senders you say Yes to will get it." : "Booking link removed.");
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
          const server = new Map(((await r.json()) as InboxCard[]).map((c) => [c.id, c]));
          const have = new Set(cur.map((c) => c.id));
          const fresh = [...server.values()].filter((c) => !have.has(c.id) && !answered.current.has(c.id));
          // A knock arrives unscored and gets its fit a moment later, so refresh scores on cards already shown.
          // Cards the server no longer lists were answered elsewhere, expired or deleted by their sender.
          const rescored = cur.filter((c) => server.has(c.id)).map((c) => { const s = server.get(c.id)!; return s.fit !== c.fit || s.spam !== c.spam ? { ...c, fit: s.fit, spam: s.spam } : c; });
          if (!fresh.length && rescored.length === cur.length && rescored.every((c, n) => c === cur[n])) continue;
          const curId = cur[iRef.current]?.id;
          const merged = sortCards([...rescored, ...fresh]);
          const at = Math.max(0, merged.findIndex((c) => c.id === curId));
          cardsRef.current = merged;
          iRef.current = at;
          setCards(merged);
          setI(at);
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

  // Read from a ref so the toast's Undo button and the U key always see the latest answer.
  const undoLast = useCallback(async () => {
    const u = undo.current;
    if (!u) return;
    clearTimeout(u.t);
    undo.current = null;
    toast.dismiss("undo");
    const r = await api.inbox[":id"].undo.$post({ param: { id: u.card.id } }).catch(() => null);
    if (r?.ok) { void loadPools(); answered.current.delete(u.card.id); setCards((cs) => [...cs!.slice(0, u.index), u.card, ...cs!.slice(u.index)]); setI(u.index); }
    else fail("Too late to undo.");
  }, [loadPools]);

  const answer = useCallback(async (a: InboxAnswer) => {
    const card = cards?.[i];
    if (!card) return;
    const extra = { reason, note: note.trim() || undefined };
    setReason(undefined);
    setNote("");
    answered.current.add(card.id);
    setCards((cs) => cs!.filter((x) => x.id !== card.id));
    setI((n) => Math.max(0, Math.min(n, (cards?.length ?? 1) - 2)));
    const r = await api.inbox[":id"].answer.$post({ param: { id: card.id }, json: { answer: a, ...extra } }).catch(() => null);
    if (r?.ok) {
      const { code } = (await r.json()) as { code?: string };
      if (code === "empty") toast.warning("That door is out of invite codes. The sender gets your booking link instead.", { duration: 10_000, action: { label: "Add codes", onClick: () => navigate("/app/settings") } });
      if (a === "yes") void loadPools();
      if (undo.current) clearTimeout(undo.current.t);
      undo.current = { card, index: i, t: setTimeout(() => { undo.current = null; }, UNDO_MS) };
      toast(`Answered ${LABEL[a]}`, { id: "undo", duration: UNDO_MS, action: { label: "Undo", onClick: () => void undoLast() } });
      return;
    }
    answered.current.delete(card.id);
    setCards((cs) => [...cs!.slice(0, i), card, ...cs!.slice(i)]);
    setReason(extra.reason);
    setNote(extra.note ?? "");
    fail(r?.status === 409 ? "That knock was already answered." : "Couldn't save your answer. Try again.");
  }, [cards, i, reason, note, loadPools, undoLast, navigate]);

  const closeRest = () => run("close", async () => {
    const r = await api.inbox["close-rest"].$post().catch(() => null);
    if (!r?.ok) return fail("Couldn't close your knocks. Nothing was changed.");
    const { closed } = await r.json();
    setCards([]);
    undo.current = null;
    toast.success(`Closed ${closed} ${closed === 1 ? "knock" : "knocks"}. Each sender was emailed.`);
  });

  useEffect(() => {
    if (settings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as Element | null)?.closest?.("input, textarea, select, [role=dialog], [role=alertdialog]")) return;
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
  const tab = "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground no-underline transition-colors duration-(--d-fast) hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground sm:h-9";

  const inbox = gate ? (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <DoorClosed className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl">No inbox on this device</h1>
      <p className="mt-2 text-muted-foreground">Make a door to start getting knocks, or sign in if you already have one.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild><a href="/new">Make a door</a></Button>
        <Button asChild variant="outline"><a href="/signin">Sign in</a></Button>
      </div>
    </div>
  ) : cards === null ? (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_1fr] lg:py-10" aria-busy="true">
      <div className="hidden space-y-2 lg:block">{[0, 1, 2].map((n) => <Skeleton key={n} className="h-16" />)}</div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  ) : !card ? (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <InboxIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl">{answered.current.size ? "All answered" : "No knocks yet"}</h1>
      <p className="mt-2 text-muted-foreground">Post your door link as the first reply under your post. New knocks show up here live.</p>
    </div>
  ) : (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:py-10">
      <aside className="hidden lg:block" aria-label="Open knocks">
        <p className="px-3 text-xs font-medium text-muted-foreground">Open <span className="tabular">{open}</span> · best fit first</p>
        <ul className="mt-2 space-y-0.5">
          {cards.map((c, n) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setI(n)}
                aria-current={n === i || undefined}
                className="w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors duration-(--d-fast) hover:bg-accent aria-[current=true]:bg-card aria-[current=true]:shadow-xs aria-[current=true]:ring-1 aria-[current=true]:ring-border"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-muted-foreground">{c.door}</span>
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
          <p className="text-sm text-muted-foreground tabular" aria-live="polite">{i + 1} of {open}</p>
        </div>
        <div className="mt-4"><Card key={card.id} c={card} onAnswer={answer} /></div>

        <div className={cn(cardBox, "mt-4 space-y-5 p-5 sm:p-6")}>
          <fieldset>
            <legend className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(REASONS) as Reason[]).map((r) => (
                <Button key={r} type="button" size="sm" variant="outline" aria-pressed={reason === r} onClick={() => setReason(reason === r ? undefined : r)}
                  className="rounded-full text-muted-foreground aria-pressed:border-primary aria-pressed:bg-brass-soft aria-pressed:text-brass-ink">
                  {REASONS[r]}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="note">Message to sender <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <span className="font-mono text-xs text-muted-foreground tabular">{note.length}/{NOTE_MAX}</span>
            </div>
            <Textarea id="note" value={note} maxLength={NOTE_MAX} rows={2} placeholder="Leave empty to send the default" onChange={(e) => setNote(e.target.value)} />
            <details className="pt-1 text-sm">
              <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">See the default messages</summary>
              <dl className="mt-2 space-y-2 text-muted-foreground">
                <div><dt className="font-medium text-foreground">No</dt><dd>{closureMessage(card.template, "no")}</dd></div>
                <div><dt className="font-medium text-foreground">Not now</dt><dd>{closureMessage(card.template, "later")}</dd></div>
              </dl>
            </details>
          </div>
        </div>
        <div className="sticky bottom-3 z-10 mt-3 grid grid-cols-3 gap-2 rounded-xl border bg-card/90 p-2 shadow-e-2 backdrop-blur-md">
          {(["no", "later", "yes"] as const).map((a) => (
            <Button key={a} variant={a === "yes" ? "default" : "ghost"} className={a === "yes" ? "" : "text-foreground"} onClick={() => void answer(a)}>
              {a !== "yes" && <span aria-hidden className={cn("size-2 rounded-full", DOT[a])} />}
              {LABEL[a]}
              <Kbd className={cn("max-sm:hidden", a === "yes" && "bg-primary-foreground/20 text-primary-foreground")} aria-hidden>{KEY[a]}</Kbd>
            </Button>
          ))}
        </div>
        <p className="mt-4 hidden items-center justify-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>U</Kbd> undo · swipe on touch
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <a href="/" className="mr-2 inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground">
            <DoorClosed className="size-5 text-primary" aria-hidden />
            <span className="max-sm:hidden">Doorbell</span>
          </a>
          <nav className="flex items-center gap-1">
            <a href="/app" onClick={go("/app")} aria-current={!settings ? "page" : undefined} className={tab}>
              Inbox{open > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular">{open}</Badge>}
            </a>
            <a href="/app/settings" onClick={go("/app/settings")} aria-current={settings ? "page" : undefined} className={tab}>
              <SettingsIcon className="size-4" aria-hidden />Settings
            </a>
          </nav>
          {!settings && open > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="ml-auto" disabled={busy === "close"}><Busy k="close" />Close all</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close {open} open {open === 1 ? "knock" : "knocks"}?</AlertDialogTitle>
                  <AlertDialogDescription>Each sender gets this message by email. This can't be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <blockquote className="rounded-md bg-muted px-4 py-3 text-sm">{CLOSE_MESSAGE}</blockquote>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void closeRest()}>Close all</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      <main>
        {settings ? (
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
            <h1 className="text-2xl">Settings</h1>
            <p className="mt-1 text-muted-foreground">How Yes answers are delivered, and how you sign in.</p>
            <div className="mt-8">
              <Section title="Booking link" desc="Sent with every Yes, so the sender can book a call.">
                <Field id="booking" label="Cal.com or Calendly link">
                  <Input id="booking" type="url" value={booking} maxLength={300} placeholder="https://cal.com/you/15min" onChange={(e) => setBooking(e.target.value)} />
                </Field>
                <Button variant="outline" disabled={busy === "booking"} onClick={() => void saveBooking()}><Busy k="booking" />Save link</Button>
              </Section>

              <Section title="Invite codes" desc="Each Yes emails one unused code to that sender. Codes never appear in your inbox.">
                {pools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No doors yet. <a href="/new">Make a door</a></p>
                ) : (
                  <>
                    <Field id="pool" label="Door">
                      <NativeSelect id="pool" value={poolDoor} onChange={(e) => setPoolDoor(e.target.value)} className="w-full">
                        {pools.map((p) => <NativeSelectOption key={p.doorId} value={p.doorId}>{p.slug} · {p.free} left of {p.total}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                    <Field id="codes" label="Codes, one per line">
                      <Textarea id="codes" value={codeText} rows={4} onChange={(e) => setCodeText(e.target.value)} className="font-mono" />
                    </Field>
                    <Field id="csv" label={<span className="font-normal text-muted-foreground">Or choose a CSV</span>}>
                      <Input id="csv" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCodeText(await f.text()); }} />
                    </Field>
                    <Button disabled={!codeText.trim() || busy === "codes"} onClick={() => void addCodes()}><Busy k="codes" />Add codes</Button>
                  </>
                )}
              </Section>

              <Section title="Email and sign-in" desc="Use your email to sign in on other devices and get a daily digest.">
                {account?.email ? (
                  <>
                    <p className="text-sm">Signed in as <strong className="font-medium">{account.email}</strong>.</p>
                    <p className="text-sm text-muted-foreground">To sign in on another device, open <a href="/signin">/signin</a> there.</p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" disabled={busy === "out"} onClick={() => void signOut(false)}><Busy k="out" />Sign out</Button>
                      <Button variant="destructive-outline" disabled={busy === "out-all"} onClick={() => void signOut(true)}><Busy k="out-all" />Sign out everywhere</Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Everywhere signs out every device, including older links from before you added an email.</p>
                    <div className="flex items-start justify-between gap-4 border-t pt-4">
                      <div>
                        <Label htmlFor="digest">Daily digest</Label>
                        <p className="mt-1 text-sm text-muted-foreground">One email around 8:00 your time, only on days with new knocks.</p>
                      </div>
                      <Switch id="digest" className="mt-1" checked={account.digest} disabled={busy === "digest"} onCheckedChange={(v) => void setDigest(v)} />
                    </div>
                  </>
                ) : (
                  <>
                    <Field id="email" label="Email">
                      <Input id="email" type="email" value={emailIn} maxLength={254} autoComplete="email" onChange={(e) => setEmailIn(e.target.value)} />
                    </Field>
                    <Button disabled={!emailIn.trim() || busy === "email"} onClick={() => void sendEmail()}><Busy k="email" />Send confirmation link</Button>
                  </>
                )}
              </Section>
            </div>
          </div>
        ) : inbox}
      </main>
      <Toaster position="top-center" offset={68} />
    </div>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

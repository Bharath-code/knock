import { hc } from "hono/client";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { keyAction, NOTE_MAX, REASONS, safeProof, swipeAnswer, UNDO_MS, type InboxAnswer, type InboxCard, type Reason } from "../shared/inbox";
import type { Api } from "../worker";
import "../styles/theme.css";

const api = hc<Api>("/api");
const LABEL: Record<InboxAnswer, string> = { yes: "Yes", later: "Not now", no: "No" };
const TONE: Record<InboxAnswer, string> = { yes: "bg-yes", later: "bg-later", no: "bg-no" };

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
  return (
    <article
      className="touch-pan-y rounded-lg border border-line bg-card p-5 shadow-e-2 select-none"
      style={{ transform: `translate(${drag[0]}px, ${Math.min(drag[1], 0)}px) rotate(${drag[0] / 20}deg)` }}
      onPointerDown={(e) => { start.current = [e.clientX, e.clientY]; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => start.current && setDrag([e.clientX - start.current[0], e.clientY - start.current[1]])}
      onPointerUp={end}
      onPointerCancel={() => { start.current = null; setDrag([0, 0]); }}
    >
      <p className="font-mono text-xs text-muted">
        {c.door} · fit {c.fit ?? "not scored"}
      </p>
      <p className="mt-3 line-clamp-3 text-[17px]">{c.message}</p>
      {safeProof(c.proof) && (
        <a className="mt-3 block truncate text-brass-ink underline" href={safeProof(c.proof)!} target="_blank" rel="noreferrer noopener">
          {safeProof(c.proof)}
        </a>
      )}
      {(c.spam || c.rewrote) && (
        <ul className="mt-3 flex gap-2 text-xs">
          {c.spam && <li className="rounded-pill border border-no px-2 py-1 text-no">Possible spam</li>}
          {c.rewrote && <li className="rounded-pill border border-line px-2 py-1 text-muted">Used AI rewrite</li>}
        </ul>
      )}
    </article>
  );
};

const App = () => {
  const [cards, setCards] = useState<InboxCard[] | null>(null);
  const [i, setI] = useState(0);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<Reason | undefined>();
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<{ card: InboxCard; at: number; index: number } | null>(null);

  useEffect(() => {
    api.inbox.$get().then(async (r) => {
      if (r.status === 401) return setError("Make a door first, then your inbox appears here.");
      setCards((await r.json()) as InboxCard[]);
    }).catch(() => setError("Couldn't load your inbox."));
  }, []);

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
    setCards((cs) => cs!.filter((x) => x.id !== card.id));
    setI((n) => Math.max(0, Math.min(n, (cards?.length ?? 1) - 2)));
    const r = await api.inbox[":id"].answer.$post({ param: { id: card.id }, json: { answer: a, ...extra } }).catch(() => null);
    if (r?.ok) return setUndo({ card, at: Date.now(), index: i });
    setCards((cs) => [...cs!.slice(0, i), card, ...cs!.slice(i)]);
    setReason(extra.reason);
    setNote(extra.note ?? "");
    setError(r?.status === 409 ? "That knock was already answered." : "Couldn't save your answer. Try again.");
  }, [cards, i, reason, note]);

  const undoLast = useCallback(async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    const r = await api.inbox[":id"].undo.$post({ param: { id: u.card.id } }).catch(() => null);
    if (r?.ok) { setCards((cs) => [...cs!.slice(0, u.index), u.card, ...cs!.slice(u.index)]); setI(u.index); }
    else setError("Too late to undo.");
  }, [undo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea")) return;
      const k = keyAction(e.key);
      if (!k) return;
      if (k.type === "move") setI((n) => Math.max(0, Math.min(n + k.by, (cards?.length ?? 1) - 1)));
      else if (k.type === "answer") void answer(k.answer);
      else void undoLast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, answer, undoLast]);

  const card = cards?.[i];
  return (
    <main className="mx-auto max-w-[380px] px-5 py-10">
      <h1 className="text-[30px] font-extrabold">Inbox</h1>
      {error && <p role="alert" className="fixed inset-x-5 top-5 z-10 mx-auto max-w-[380px] rounded-lg bg-no p-3 text-sm text-on-accent shadow-e-2">{error}</p>}
      {cards && !card && (
        <section className="mt-6 rounded-lg border border-line bg-card p-5 shadow-e-1">
          <h2 className="text-lg font-bold">{undo ? "All answered" : "No knocks yet"}</h2>
          <p className="mt-2">Post your door link as the first reply under your post.</p>
        </section>
      )}
      {card && (
        <>
          <p className="mt-2 font-mono text-xs text-muted" aria-live="polite">{i + 1} of {cards!.length}</p>
          <div className="mt-4"><Card key={card.id} c={card} onAnswer={answer} /></div>
          <fieldset className="mt-4">
            <legend className="text-sm text-muted">Reason (optional)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(REASONS) as Reason[]).map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(reason === r ? undefined : r)}
                  className={`min-h-11 rounded-pill border px-4 text-sm ${reason === r ? "border-brass bg-brass-soft text-brass-ink" : "border-line text-muted"}`}>
                  {REASONS[r]}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm text-muted">
              Note to sender (optional)
              <textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-card p-3 text-ink" />
            </label>
            <p className="text-right font-mono text-xs text-muted">{note.length}/{NOTE_MAX}</p>
          </fieldset>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {(["no", "later", "yes"] as const).map((a) => (
              <button key={a} className={`min-h-11 rounded-pill px-4 font-medium text-on-accent ${TONE[a]}`} onClick={() => void answer(a)}>
                {LABEL[a]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-xs text-muted">J/K move · Y yes · L not now · N no · U undo</p>
        </>
      )}
      {undo && (
        <div role="status" className="fixed inset-x-5 bottom-5 mx-auto flex max-w-[380px] items-center justify-between rounded-lg bg-ink p-3 text-paper">
          <span>Answered.</span>
          <button className="min-h-11 px-3 font-medium underline" onClick={() => void undoLast()}>Undo</button>
        </div>
      )}
    </main>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

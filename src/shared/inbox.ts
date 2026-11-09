import type { Chip } from "./chips";
export const UNDO_MS = 5_000;
// Each answer stays undoable for its own window; the newest is popped first.
export type UndoEntry<T> = { item: T; until: number };
export const pushUndo = <T>(stack: UndoEntry<T>[], item: T, now: number): UndoEntry<T>[] => [...live(stack, now), { item, until: now + UNDO_MS }];
export const live = <T>(stack: UndoEntry<T>[], now: number) => stack.filter((e) => e.until > now);
export const popUndo = <T>(stack: UndoEntry<T>[], now: number): { entry: UndoEntry<T> | null; rest: UndoEntry<T>[] } => {
  const l = live(stack, now);
  return { entry: l.at(-1) ?? null, rest: l.slice(0, -1) };
};
export const ANSWERS = ["yes", "later", "no"] as const;
export type InboxAnswer = (typeof ANSWERS)[number];
export const asAnswer = (s: unknown): InboxAnswer | null => ((ANSWERS as readonly unknown[]).includes(s) ? (s as InboxAnswer) : null);

export const REASONS = {
  level: "Not hiring at this level",
  stage: "Not a fit for stage",
  full: "Full",
} as const;
export type Reason = keyof typeof REASONS;
export const asReason = (s: unknown): Reason | null => (typeof s === "string" && s in REASONS ? (s as Reason) : null);
export const NOTE_MAX = 140;
export type Reply = { answer: InboxAnswer; reason?: Reason; note?: string };

export type InboxCard = {
  id: string;
  door: string;
  template: string;
  message: string;
  answers: { q: string; a: string }[];
  proof: string | null;
  fit: number | null;
  spam: boolean;
  rewrote: boolean;
  chips: Chip[];
  createdAt: number;
  expiresAt: number;
  passedBy?: string;
};

// Swipe right = Yes, left = No, up = Not now. Returns null for a small or ambiguous drag.
export const swipeAnswer = (dx: number, dy: number, min = 80): InboxAnswer | null => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "yes" : "no";
  return dy < 0 ? "later" : null;
};

export type KeyAction = { type: "move"; by: 1 | -1 } | { type: "answer"; answer: InboxAnswer } | { type: "undo" };
export const keyAction = (key: string): KeyAction | null => {
  switch (key.toLowerCase()) {
    case "j": return { type: "move", by: 1 };
    case "k": return { type: "move", by: -1 };
    case "y": return { type: "answer", answer: "yes" };
    case "l": return { type: "answer", answer: "later" };
    case "n": return { type: "answer", answer: "no" };
    case "u": return { type: "undo" };
    default: return null;
  }
};

export const safeProof = (u: string | null) => {
  try {
    const p = new URL(u ?? "");
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : null;
  } catch {
    return null;
  }
};

export const CLOSE_REASON = "bulk";
export const CLOSE_MESSAGE =
  "Thanks for knocking. I can't take this one on right now, and I wanted you to hear back instead of waiting. I wish you the best with it.";

// Best fit first, unscored last, then oldest first. Matches the server's ORDER BY.
export const sortCards = (cs: InboxCard[]) =>
  [...cs].sort((a, b) => Number(a.fit == null) - Number(b.fit == null) || (b.fit ?? 0) - (a.fit ?? 0) || a.createdAt - b.createdAt);

export const POLL_MS = 30_000;

export const MOMENT_MIN = 3;
export const minutesTaken = (ms: number) => Math.max(1, Math.round(ms / 60_000));

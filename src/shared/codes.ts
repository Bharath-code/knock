export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;
export const MAX_CODES = 1000;

// Paste or CSV: one code per line, or comma/semicolon separated. A leading "code" header is skipped.
export const parseCodes = (text: string): { codes: string[]; bad: string[] } => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const parts = text.split(/[\r\n,;]+/).map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (parts[0]?.toLowerCase() === "code") parts.shift();
  for (const p of parts) {
    if (!CODE_RE.test(p)) bad.push(p.slice(0, 20));
    else seen.add(p);
  }
  return { codes: [...seen], bad };
};

export type Pool = { doorId: string; slug: string; free: number; total: number };
export type YesCode = "assigned" | "empty" | "none";

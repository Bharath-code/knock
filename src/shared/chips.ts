export type Chip = { label: string; quote: string };

export const MAX_CHIPS = 3;

// The quote as it appears in `text`, matching case and runs of whitespace loosely. Null when the words are not there.
export const findQuote = (text: string, quote: string): [number, number] | null => {
  const q = quote.trim();
  if (q.length < 3) return null;
  const m = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "iu").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
};

// A chip is shown only if its quote really is in the knock: no evidence, no chip.
export const groundChips = (chips: unknown, texts: string[]): Chip[] => {
  if (!Array.isArray(chips)) return [];
  const out: Chip[] = [];
  for (const c of chips) {
    const label = typeof c?.label === "string" ? c.label.trim() : "";
    const quote = typeof c?.quote === "string" ? c.quote.trim() : "";
    if (label && texts.some((t) => findQuote(t, quote))) out.push({ label: label.slice(0, 40), quote });
    if (out.length === MAX_CHIPS) break;
  }
  return out;
};

// Splits `text` around the quote so the caller can mark the middle part.
export const splitAround = (text: string, quote: string | null): [string, string, string] => {
  const at = quote ? findQuote(text, quote) : null;
  return at ? [text.slice(0, at[0]), text.slice(at[0], at[1]), text.slice(at[1])] : [text, "", ""];
};

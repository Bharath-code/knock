export const LENGTH_LIMIT = 400;

const LINK =
  /(?<![@\w.-])(?:https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+(?:com|dev|io|ai|app|co|in|org|net|me|sh|so|xyz|ly|gg|cc)(?:\/\S*)?)/gi;
const PLACEHOLDER_LINK = /\[(?:link|url|resume)\]/gi;
const NUMBER = /(?<![A-Za-z])\d/;
const ASK =
  /\?|\b(?:could|can|would|will|may)\s+(?:you|we|i)\b|\bopen to\b|\bplease\b|\blet me know\b|\bwould love\b|\b(?:refer|introduce)\s+me\b/i;

// ponytail: a short list of common slips, not a spell checker; the model pass in CHK-2 catches the rest
const MISSPELLINGS: Record<string, string> = {
  iam: "I am",
  ive: "I've",
  intersted: "interested",
  intrested: "interested",
  ggolang: "golang",
  teh: "the",
  recieve: "receive",
  recieved: "received",
  seperate: "separate",
  definately: "definitely",
  experiance: "experience",
  experince: "experience",
  enginer: "engineer",
  enginner: "engineer",
  developper: "developer",
  devloper: "developer",
  sofware: "software",
  softare: "software",
  managment: "management",
  sucessful: "successful",
  succesful: "successful",
  thier: "their",
  wich: "which",
  adress: "address",
  oppurtunity: "opportunity",
  oportunity: "opportunity",
  referal: "referral",
  resposible: "responsible",
  acheive: "achieve",
  acheived: "achieved",
};

const AN_BEFORE_CONSONANT = /\b([Aa])n\s+([B-DF-GJ-NP-TV-Zb-df-gj-np-tv-z][a-z]+)/g;
const DOUBLED_WORD = /\b([a-z]+)\s+\1\b/gi;
const SPACE_BEFORE_PUNCTUATION = /\S[ \t]+[.,;!?](?=\s|$)/g;
const ALLOWED_DOUBLES = new Set(["that", "had"]);

export type Typo = { word: string; fix: string };

export type CheckResult = {
  length: { ok: boolean; count: number; limit: number; hint?: string };
  numbers: { ok: boolean; hint?: string };
  link: { ok: boolean; count: number; hint?: string };
  ask: { ok: boolean; hint?: string };
  typos: { ok: boolean; found: Typo[]; hint?: string };
};

const findTypos = (text: string): Typo[] => {
  const found: Typo[] = [];
  for (const word of text.match(/[A-Za-z]+/g) ?? []) {
    const isAcronym = word.length > 1 && word === word.toUpperCase();
    const fix = isAcronym ? undefined : MISSPELLINGS[word.toLowerCase()];
    if (fix) found.push({ word, fix });
  }
  for (const [word, article, next] of text.matchAll(AN_BEFORE_CONSONANT)) {
    found.push({ word, fix: `${article} ${next}` });
  }
  for (const [word, repeated] of text.matchAll(DOUBLED_WORD)) {
    if (!ALLOWED_DOUBLES.has(repeated!.toLowerCase())) found.push({ word, fix: repeated! });
  }
  for (const [match] of text.matchAll(SPACE_BEFORE_PUNCTUATION)) {
    found.push({ word: match, fix: match.replace(/[ \t]+/, "") });
  }
  return found;
};

export const check = (raw: string): CheckResult => {
  const draft = raw.trim();
  const links = draft.match(LINK) ?? [];
  const hasPlaceholder = PLACEHOLDER_LINK.test(draft);
  PLACEHOLDER_LINK.lastIndex = 0;
  const prose = draft.replace(LINK, "§").replace(PLACEHOLDER_LINK, "§");

  const count = [...draft].length;
  const numbers = NUMBER.test(prose);
  const ask = ASK.test(prose);
  const found = findTypos(prose);

  const linkHint =
    links.length > 1
      ? "Keep one link: your strongest proof."
      : links.length === 1
        ? undefined
        : hasPlaceholder
          ? "Replace the placeholder with your real link."
          : "Add one link that proves your work.";

  return {
    length: {
      ok: count > 0 && count <= LENGTH_LIMIT,
      count,
      limit: LENGTH_LIMIT,
      ...(count > LENGTH_LIMIT && { hint: `Cut ${count - LENGTH_LIMIT} characters to reach ${LENGTH_LIMIT}.` }),
    },
    numbers: { ok: numbers, ...(!numbers && { hint: "Add one number, like years or stars." }) },
    link: { ok: links.length === 1, count: links.length, ...(linkHint && { hint: linkHint }) },
    ask: { ok: ask, ...(!ask && { hint: "End with one clear ask, like a 15-minute call." }) },
    typos: {
      ok: found.length === 0,
      found,
      ...(found.length > 0 && { hint: "Fix these before you send." }),
    },
  };
};

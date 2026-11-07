import { z } from "zod";

export const templates = ["referral", "beta", "gig"] as const;
export type Template = (typeof templates)[number];
export const WINDOWS = [3, 7, 14] as const;
export const PROFILE_SLUG = "profile";

// ponytail: keyword counts, not a model. Add a Haiku fallback if real posts miss often.
const SIGNALS: Record<Template, RegExp> = {
  referral:
    /\b(refer\w*|hiring|openings?|jobs?|roles?|positions?|apply|applicants?|candidates?|recruit\w*|resume|cv|join (?:our|my) team|backend|frontend|engineers?|sde|swe)\b/gi,
  beta: /\b(beta|testers?|early access|waitlist|alpha|try (?:it|out)|feedback|early users?|invites?|invite codes?|dogfood\w*|preview|launch\w*)\b/gi,
  gig: /\b(freelanc\w*|contract(?:or)?|gigs?|budget|paid|hourly|per hour|rates?|quote|projects?|commission\w*|agency|one-off|designers?|illustrators?|writers?|editors?|need (?:a|an|someone)|short engagement)\b/gi,
};

const hits = (text: string, re: RegExp) => new Set(text.toLowerCase().match(re) ?? []).size;

export const pickTemplate = (post: string): Template => {
  const score = templates.map((t) => [t, hits(post, SIGNALS[t])] as const);
  const best = score.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] === 0 ? "referral" : best[0];
};

export const defaultFields: Record<Template, string[]> = {
  referral: ["The role you are asking about", "Link to your resume or work", "Why you are a fit"],
  beta: ["What you would test", "Your device or setup", "Link to your profile"],
  gig: ["What you can do for this project", "Link to similar work", "Your rate and timing"],
};

export const profileFields = ["What you would like to ask", "Link to your work", "Why me"];

export const slugify = (text: string, max = 40) => {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let slug = "";
  for (const w of words) {
    const next = slug ? `${slug}-${w}` : w;
    if (next.length > max) break;
    slug = next;
    if (slug.split("-").length >= 6) break;
  }
  return slug || "door";
};

export const replyLine = (url: string) => `DM me, or knock here for a guaranteed answer: ${url}`;

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9_]{3,20}$/));

export const createDoorSchema = z.object({
  handle: handleSchema,
  name: z.string().trim().max(60).default(""),
  post: z.string().trim().max(10_000).default(""),
  template: z.enum(templates),
  fields: z.array(z.string().trim().min(1).max(60)).min(1).max(3),
  window: z.coerce.number().pipe(z.union([z.literal(3), z.literal(7), z.literal(14)])),
});
export type CreateDoor = z.infer<typeof createDoorSchema>;

export const answerRate = (total: number, answered: number) =>
  total >= 5 ? Math.round((answered / total) * 100) : null;

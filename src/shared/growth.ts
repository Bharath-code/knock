import { templates, type Template } from "./door";

export const REFS = ["door", "status", "email"] as const;
export type Ref = (typeof REFS)[number];
export const asRef = (s: unknown): Ref | null => ((REFS as readonly unknown[]).includes(s) ? (s as Ref) : null);
export const asTemplate = (s: unknown): Template | null => ((templates as readonly unknown[]).includes(s) ? (s as Template) : null);

// The tracked entry point every "make your own door" link goes through.
export const ownDoorPath = (from: Ref, t?: string | null) => `/go/door?from=${from}${asTemplate(t) ? `&t=${t}` : ""}`;

// Starter posts for the prefilled form. The brackets are there to be replaced.
export const STARTER: Record<Template, string> = {
  referral: "I'm hiring a [role] in [city]. Knock with your work and why you're a fit, and I'll answer every request.",
  beta: "I'm looking for beta testers for [product]. Knock with your setup and what you'd test, and I'll answer every request.",
  gig: "I need help with [project]. Knock with similar work and your rate, and I'll answer every request.",
};

export const REF_LINE: Record<Ref, string> = {
  door: "You just saw a door. Make your own and every request you get is answered.",
  status: "Your knock gets an answer. Give the people who message you the same.",
  email: "Your knock got an answer through Doorbell. Give the people who message you the same.",
};

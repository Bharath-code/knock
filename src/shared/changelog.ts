// Newest first. Add an entry when something a user can see ships. Dates are the day it reached the main branch.
export type Release = { date: string; title: string; points: string[] };

export const CHANGELOG: Release[] = [
  {
    date: "2026-11-09",
    title: "Template gallery",
    points: [
      "Copy the setup of a public door that answers at least 80% of knocks: its questions and window, never its knocks.",
      "Owners can list a door from Settings. Unlisting, or dropping under 80%, removes it.",
    ],
  },
  {
    date: "2026-11-09",
    title: "Referral post guides",
    points: ["Ten guides on how to answer a referral post on X, one per role, each with a sample DM and a link to the checker."],
  },
  {
    date: "2026-11-09",
    title: "Closing the loop",
    points: [
      "You get an email when a receiver first opens your knock, with its own switch to turn it off.",
      "A Not now now tells you the date you can knock again, and you get one reminder then.",
      "A week after a Yes, both sides are asked whether it happened.",
      "Signing in matches the exact email address, so a +tag address no longer blocks the plain one.",
    ],
  },
  {
    date: "2026-11-08",
    title: "Sign in, digest and trust",
    points: [
      "Sign in with an email link, with sessions you can end on every device.",
      "Receivers get one daily digest, only on days with new knocks.",
      "Kind default messages for No and Not now, and knocks that run out of time close with a note.",
      "Invite-code pools for Yes answers, and a Cal.com or Calendly link on every Yes.",
      "A privacy page, and a way for senders to delete their own knock.",
      "Share cards for your door, your checker score and the moment you answer everyone.",
      "The checker shows your old and new score side by side with a highlighted rewrite.",
      "A sample door and knock for new receivers, and a Talk to Bharath link on every screen.",
    ],
  },
  {
    date: "2026-11-07",
    title: "First release",
    points: [
      "The DM checker: five quick rules and an AI fit score, no account needed.",
      "Doors you make from a post, plus one profile door per person.",
      "The knock form, one knock per sender per door, and a receipt with a status link.",
      "The inbox: best fits first, swipe or keyboard answers, undo, close the rest, and live updates.",
    ],
  },
];

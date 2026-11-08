import { z } from "zod";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// One person, one knock per door: "a+x@gmail.com" and "a@gmail.com" count as the same sender.
export const emailKey = (email: string) => {
  const [local = "", domain = ""] = normalizeEmail(email).split("@");
  return `${local.split("+")[0]}@${domain}`;
};

export const knockSchema = (fieldCount: number) =>
  z.object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    message: z.string().trim().min(1).max(2000),
    answers: z.array(z.string().trim().min(1).max(500)).length(fieldCount),
    proof: z
      .string()
      .trim()
      .max(300)
      .refine((v) => v === "" || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v))
      .default(""),
    consent: z.literal("on"),
  });
export type KnockInput = z.infer<ReturnType<typeof knockSchema>>;

export const SOURCES = ["reply", "bio"] as const;
export type Source = (typeof SOURCES)[number];
export const asSource = (s: string | undefined): Source => (SOURCES as readonly string[]).includes(s ?? "") ? (s as Source) : "bio";

export const ANSWER_LABEL: Record<string, string> = {
  yes: "Yes",
  later: "Not now",
  no: "No, thank you",
  pass: "Passed to a better door",
  expired: "They didn't get to it",
};

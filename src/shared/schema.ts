import { z } from "zod";

export const healthSchema = z.object({ status: z.literal("ok") });
export type Health = z.infer<typeof healthSchema>;

export const checkRequestSchema = z.object({
  post: z.string().max(10_000).default(""),
  draft: z.string().trim().min(1).max(10_000),
});

export const tables = [
  "audit_log",
  "codes",
  "decisions",
  "door_stats",
  "doors",
  "feedback",
  "form_connections",
  "knocks",
  "magic_links",
  "notification_prefs",
  "orgs",
  "outcomes",
  "passes",
  "people",
  "person_stats",
  "sessions",
  "users",
] as const;

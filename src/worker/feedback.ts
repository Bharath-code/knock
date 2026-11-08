import { z } from "zod";

export const TAGS = ["bug", "request", "confusion"] as const;
export type Tag = (typeof TAGS)[number];

export const feedbackSchema = z.object({
  tag: z.enum(TAGS),
  body: z.string().trim().min(1).max(2000),
  contact: z.string().trim().max(200).default(""),
  page: z.string().max(200).default(""),
});

// Only same-site paths are kept, so the field can't carry a link.
export const cleanPage = (p: string) => (/^\/(?!\/)[\w\-./]*$/.test(p) ? p.slice(0, 200) : "");

export const saveFeedback = async (db: D1Database, f: z.infer<typeof feedbackSchema>, personId: string | null, now = Date.now()) =>
  db
    .prepare("INSERT INTO feedback (id, person_id, tag, body, at, contact, page) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(crypto.randomUUID(), personId, f.tag, f.body, now, f.contact || null, cleanPage(f.page) || null)
    .run();

export type FeedbackRow = { id: string; tag: Tag; body: string; at: number; contact: string | null; page: string | null; reviewed_at: number | null };

// Unreviewed first, newest first within each group.
export const listFeedback = async (db: D1Database) =>
  (await db.prepare("SELECT id, tag, body, at, contact, page, reviewed_at FROM feedback ORDER BY reviewed_at IS NOT NULL, at DESC LIMIT 200").all<FeedbackRow>()).results;

export const markReviewed = async (db: D1Database, now = Date.now()) =>
  (await db.prepare("UPDATE feedback SET reviewed_at = ?1 WHERE reviewed_at IS NULL").bind(now).run()).meta.changes ?? 0;

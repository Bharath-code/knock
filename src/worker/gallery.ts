import { asKnockId, asTemplate } from "../shared/growth";
import type { Template } from "../shared/door";
import type { OwnerUser } from "./inbox";
import { BADGE_MIN_RATE } from "./stats";

export type GalleryRow = { doorId: string; template: Template; window: number; fields: string[]; pct: number; yes: "booking" | "none" };

const parse = <T>(json: string | null, fallback: T): T => {
  try {
    return (JSON.parse(json ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};

// Reads doors and door_stats only, never knocks. The Yes action is reduced to its type so nobody's booking link is copied.
export const galleryRows = async (db: D1Database, doorId?: string): Promise<GalleryRow[]> => {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.template, d.window_days AS days, d.fields_json AS fields, d.yes_action_json AS yes, s.answer_rate_90d AS rate
       FROM doors d JOIN door_stats s ON s.door_id = d.id
       WHERE d.listed_optin = 1 AND d.status = 'open' AND s.answer_rate_90d >= ?1 AND (?2 IS NULL OR d.id = ?2)
       ORDER BY s.answer_rate_90d DESC, d.created_at DESC LIMIT 60`,
    )
    .bind(BADGE_MIN_RATE, doorId ?? null)
    .all<{ id: string; template: string; days: number; fields: string; yes: string | null; rate: number }>();
  return results.flatMap((r): GalleryRow[] => {
    const template = asTemplate(r.template);
    const fields = parse<unknown[]>(r.fields, []).filter((f): f is string => typeof f === "string" && f.trim() !== "").slice(0, 3);
    if (!template || !fields.length) return [];
    return [{ doorId: r.id, template, window: r.days, fields, pct: Math.round(r.rate * 100), yes: parse<{ type?: string } | null>(r.yes, null)?.type === "booking" ? "booking" : "none" }];
  });
};

export const galleryDoor = async (db: D1Database, id: unknown) => {
  const k = asKnockId(id);
  return k ? ((await galleryRows(db, k))[0] ?? null) : null;
};

export const setListed = async (db: D1Database, o: OwnerUser, doorId: string, on: boolean) =>
  ((await db.prepare("UPDATE doors SET listed_optin = ?3 WHERE id = ?1 AND owner_user_id = ?2").bind(doorId, o.userId, on ? 1 : 0).run()).meta.changes ?? 0) === 1;

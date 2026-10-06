import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { resolveAlerts, sendAlert, sendEmail } from "./alerts";
import { setSetting } from "./settings-store";

// Content and configuration only. Secrets never leave the database: page tokens, password hashes,
// and any settings key that looks like a credential are excluded.
const TABLES: Array<{ name: string; query: ReturnType<typeof sql> }> = [
  { name: "posts", query: sql`select * from posts` },
  { name: "post_media", query: sql`select * from post_media` },
  { name: "campaigns", query: sql`select * from campaigns` },
  { name: "post_templates", query: sql`select * from post_templates` },
  { name: "post_recurrences", query: sql`select * from post_recurrences` },
  { name: "queue_slots", query: sql`select * from queue_slots` },
  { name: "library_items", query: sql`select * from library_items` },
  { name: "content_goals", query: sql`select * from content_goals` },
  { name: "facebook_pages", query: sql`select id, name, facebook_page_id, platform, profile_url, is_active, created_at from facebook_pages` },
  { name: "users", query: sql`select id, email, name, role, is_active, created_at from users` },
  { name: "quick_replies", query: sql`select * from quick_replies` },
  { name: "comment_rules", query: sql`select * from comment_rules` },
  { name: "settings", query: sql`select key, value, updated_at from settings where key not ilike '%token%' and key not ilike '%secret%' and key not ilike '%password%'` },
];

export async function buildBackup() {
  const db = getDb();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t.name] = (await db.execute(t.query).catch(() => ({ rows: [] }))).rows;
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { file: { format: "social-publisher-backup", version: 1, createdAt: new Date().toISOString(), counts, data }, counts };
}

/** Emails a gzipped JSON backup as an attachment. */
export async function emailBackup() {
  try {
    const { file, counts } = await buildBackup();
    const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    const content = gzipSync(Buffer.from(JSON.stringify(file))).toString("base64");
    const summary = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `- ${k}: ${n}`).join("\n");
    const sent = await sendEmail(`نسخة احتياطية ${day}`, `مرفق نسخة احتياطية من محتوى النظام وإعداداته (بدون رموز وصول أو كلمات مرور).\n\n${summary}\n\nاحتفظ بها في مكان آمن.`, [{ filename: `social-publisher-backup-${day}.json.gz`, content }]);
    await setSetting("backup_status", { lastAttemptAt: new Date().toISOString(), lastSuccessAt: sent ? new Date().toISOString() : null, ok: sent, counts });
    if (sent) await resolveAlerts(["backup_failed"]);
    else await sendAlert("backup_failed", "تعذر إرسال النسخة الاحتياطية", "تم إنشاء النسخة الاحتياطية لكن تعذر إرسالها عبر البريد. تحقق من إعدادات البريد.", 12);
    return sent;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setSetting("backup_status", { lastAttemptAt: new Date().toISOString(), lastSuccessAt: null, ok: false, error: message.slice(0, 300) }).catch(() => {});
    await sendAlert("backup_failed", "فشل إنشاء النسخة الاحتياطية", message.slice(0, 900), 12);
    throw error;
  }
}

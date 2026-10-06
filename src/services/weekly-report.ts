import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sendEmail } from "./alerts";
import { getSetting, setSetting } from "./settings-store";

type Row = Record<string, unknown>;
const riyadhNow = () => new Date(Date.now() + 3 * 3600000);

/** Sunday 09:00 Riyadh, once per week. */
export function weeklyReportDue(now = new Date()) {
  const r = new Date(now.getTime() + 3 * 3600000);
  return r.getUTCDay() === 0 && r.getUTCHours() === 9;
}

export async function buildWeeklyReport() {
  const db = getDb();
  const one = async (q: ReturnType<typeof sql>) => ((await db.execute(q)).rows[0] ?? {}) as Row;
  const posts = await one(sql`select count(*) filter (where status='published' and published_at > now()-interval '7 days')::int as published,
    count(*) filter (where status='failed' and failed_at > now()-interval '7 days' and deleted_at is null)::int as failed,
    count(*) filter (where status='scheduled' and deleted_at is null and scheduled_at < now()+interval '7 days')::int as next_week from posts`);
  const comments = await one(sql`select count(*) filter (where not is_from_page)::int as received,
    count(*) filter (where status='hidden')::int as hidden from facebook_comments where created_time > now()-interval '7 days'`).catch(() => ({} as Row));
  const replies = await one(sql`select count(*) filter (where reply_type='automation')::int as auto, count(*)::int as total from comment_replies where status='sent' and sent_at > now()-interval '7 days'`).catch(() => ({} as Row));
  const top = await one(sql`select left(p.content, 90) as content, count(c.*)::int as comments from posts p join facebook_comments c on c.post_id=p.facebook_post_id and not c.is_from_page
    where p.published_at > now()-interval '7 days' group by p.id order by comments desc limit 1`).catch(() => ({} as Row));
  const lines = [
    `ملخص أسبوعك (حتى ${riyadhNow().toISOString().slice(0, 10)})`,
    "",
    `📤 منشورات نُشرت: ${posts.published ?? 0}`,
    `❌ منشورات فشلت: ${posts.failed ?? 0}`,
    `🗓️ مجدولة للأسبوع القادم: ${posts.next_week ?? 0}`,
    "",
    `💬 تعليقات جديدة: ${comments.received ?? 0}`,
    `↩️ ردود أُرسلت: ${replies.total ?? 0} (تلقائية: ${replies.auto ?? 0})`,
    `🙈 تعليقات أُخفيت: ${comments.hidden ?? 0}`,
  ];
  if (top.content) lines.push("", `🏆 أكثر منشور تفاعلًا (${top.comments} تعليق):`, `«${String(top.content).replace(/\s+/g, " ")}…»`);
  if (Number(posts.next_week ?? 0) === 0) lines.push("", "⚠️ لا توجد منشورات مجدولة للأسبوع القادم.");
  lines.push("", "افتح لوحة التحكم: https://sp.leanpix.site/dashboard");
  return lines.join("\n");
}

/** Sends the weekly report once per Sunday; safe to call on every worker run. */
export async function maybeSendWeeklyReport(now = new Date()) {
  if (!weeklyReportDue(now)) return false;
  const week = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  if ((await getSetting<string>("weekly_report_last", "")) === week) return false;
  await setSetting("weekly_report_last", week);
  return sendEmail("التقرير الأسبوعي", await buildWeeklyReport());
}

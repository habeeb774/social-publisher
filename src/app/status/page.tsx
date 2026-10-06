import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { runDiagnostics } from "@/services/diagnostics";
import { AppShell } from "../ui/app-shell";
import { MetricStrip } from "../ui/kit";
import { StatusClient } from "./status-client";
import { CommentsHealth } from "../inbox/comments-health";
import { getSetting } from "@/services/settings-store";

export const dynamic = "force-dynamic";

export default async function Status() {
  const db = getDb();
  const [diagnostics, attempts, recovering, backup] = await Promise.all([
    runDiagnostics(false),
    db.execute(sql`
      select
        count(*) filter (where status = 'success')::int as success,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'outcome_unknown')::int as uncertain
      from publication_attempts
      where started_at > now() - interval '24 hours'
    `).then((r) => r.rows[0] as { success: number; failed: number; uncertain: number }).catch(() => ({ success: 0, failed: 0, uncertain: 0 })),
    db.execute(sql`
      select count(*)::int as n
      from posts
      where status = 'scheduled'
        and deleted_at is null
        and last_error is not null
        and exists (
          select 1 from publication_attempts pa
          where pa.post_id = posts.id and pa.status = 'failed'
        )
    `).then((r) => Number((r.rows[0] as { n: number })?.n ?? 0)).catch(() => 0),
    getSetting<{ lastAttemptAt?: string; lastSuccessAt?: string | null; ok?: boolean } | null>("backup_status", null),
  ]);
  const total = attempts.success + attempts.failed + attempts.uncertain;
  const successRate = total ? Math.round((attempts.success / total) * 1000) / 10 : null;

  return <AppShell title="حالة النظام">
    <MetricStrip items={[
      { label: "نجاح النشر · 24 ساعة", value: successRate === null ? "—" : `${successRate}%`, hint: `${attempts.success} ناجح` },
      { label: "قيد Auto Recovery", value: recovering, hint: "للأخطاء المؤقتة فقط" },
      { label: "فشل · 24 ساعة", value: attempts.failed, href: "/failed" },
      { label: "نتيجة غير مؤكدة", value: attempts.uncertain, hint: "لا تُعاد تلقائيًا", href: "/failed" },
      {
        label: "آخر نسخة احتياطية",
        value: backup?.lastSuccessAt ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" }).format(new Date(backup.lastSuccessAt)) : "—",
        hint: backup?.ok ? "آخر إرسال ناجح" : backup?.lastAttemptAt ? "آخر محاولة لم تنجح" : "لم تُرسل بعد",
        href: "/settings/export",
      },
    ]} />
    <StatusClient initial={diagnostics} />
    <CommentsHealth />
  </AppShell>;
}

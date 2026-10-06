import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, schedulerRuns } from "@/db/schema";
import { checkGraphAccess, inspectGraphToken, isGraphConfigured } from "./facebook-graph";
import { testWindsorMcp } from "./windsor-mcp";
import { storageProvider } from "./storage";
import { isPublishingEnabled } from "./publishing-mode";

export type Check = { key: string; label: string; state: "healthy" | "warning" | "error" | "off"; detail: string };
const timed = async <T,>(fn: () => Promise<T>, ms = 10000) => Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("انتهت المهلة")), ms))]);

/** Read-only checks. Nothing here publishes or writes to Facebook. `deep` adds network calls to Meta and Windsor. */
export async function runDiagnostics(deep: boolean): Promise<{ checks: Check[]; lastRunSeconds: number | null; publishingEnabled: boolean }> {
  const checks: Check[] = [];
  let lastRunSeconds: number | null = null;
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    checks.push({ key: "database", label: "قاعدة البيانات", state: "healthy", detail: "متصلة" });
    const [run] = await db.select({ at: schedulerRuns.triggeredAt, status: schedulerRuns.status }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1);
    lastRunSeconds = run ? Math.round((Date.now() - run.at.getTime()) / 1000) : null;
    const stale = lastRunSeconds === null || lastRunSeconds > 1500;
    checks.push({ key: "scheduler", label: "الجدولة", state: stale ? "error" : run.status === "success" ? "healthy" : "warning", detail: lastRunSeconds === null ? "لم يعمل بعد" : `آخر تشغيل قبل ${formatAgo(lastRunSeconds)}` });
    if (deep && isGraphConfigured()) {
      const [page] = await db.select().from(facebookPages).limit(1);
      if (page) {
        try { const visible = await timed(() => checkGraphAccess(page.facebookPageId)); checks.push({ key: "facebook_page", label: "صفحة Facebook", state: "healthy", detail: `ظاهرة: ${visible.name}` }); }
        catch (error) { checks.push({ key: "facebook_page", label: "صفحة Facebook", state: "error", detail: error instanceof Error ? error.message : "تعذر الوصول" }); }
      }
    }
  } catch (error) {
    checks.push({ key: "database", label: "قاعدة البيانات", state: "error", detail: error instanceof Error ? error.message : "غير متصلة" });
  }
  if (isGraphConfigured()) {
    if (deep) {
      try {
        const token = await timed(() => inspectGraphToken());
        const soon = token.expiresAt && token.expiresAt.getTime() - Date.now() < 7 * 86400000;
        checks.push({ key: "facebook", label: "اتصال Facebook (توكن)", state: !token.valid ? "error" : soon ? "warning" : "healthy", detail: !token.valid ? token.reason ?? "غير صالح" : token.expiresAt ? `ينتهي ${token.expiresAt.toISOString().slice(0, 10)}` : "لا ينتهي" });
      } catch (error) { checks.push({ key: "facebook", label: "اتصال Facebook (توكن)", state: "error", detail: error instanceof Error ? error.message : "تعذر الفحص" }); }
    } else checks.push({ key: "facebook", label: "اتصال Facebook (توكن)", state: "healthy", detail: "مُعد — شغّل التشخيص للتحقق" });
  } else checks.push({ key: "facebook", label: "اتصال Facebook (توكن)", state: "warning", detail: "غير مُعد؛ النشر يعتمد على Windsor" });
  if (deep && process.env.WINDSOR_API_KEY) {
    try { const mcp = await timed(() => testWindsorMcp()); checks.push({ key: "windsor", label: "Windsor MCP", state: mcp.facebookOrganicConnected ? "healthy" : "warning", detail: mcp.facebookOrganicConnected ? "متصل (قراءة فقط؛ لا يملك صلاحية النشر)" : "facebook_organic غير متصل" }); }
    catch (error) { checks.push({ key: "windsor", label: "Windsor MCP", state: "warning", detail: error instanceof Error ? error.message.split(":")[0] : "تعذر الاتصال" }); }
  } else checks.push({ key: "windsor", label: "Windsor MCP", state: process.env.WINDSOR_API_KEY ? "healthy" : "off", detail: process.env.WINDSOR_API_KEY ? "مُعد — شغّل التشخيص للتحقق" : "غير مُعد" });
  try {
    const db = getDb();
    const sync = await db.execute(sql`select status, error_code, started_at from comments_sync_runs order by started_at desc limit 1`).then((r) => r.rows[0] as { status: string; error_code: string | null; started_at: string } | undefined).catch(() => null);
    checks.push({ key: "comments", label: "مزامنة التعليقات", state: sync === null ? "off" : !sync ? "off" : ["success", "completed"].includes(sync.status) ? "healthy" : "warning", detail: sync === null ? "غير مُعدة" : !sync ? "لم تعمل بعد · تعمل تلقائيًا كل 10 دقائق" : `${sync.error_code ?? sync.status} · ${new Date(sync.started_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}` });
    const [n] = (await db.execute(sql`select count(*)::int as n from notifications where created_at > now() - interval '7 days'`)).rows as Array<{ n: number }>;
    checks.push({ key: "notifications", label: "الإشعارات", state: "healthy", detail: `${n?.n ?? 0} إشعار خلال 7 أيام · البريد ${process.env.RESEND_API_KEY ? "مفعّل" : "غير مُعد"}` });
  } catch { /* optional checks */ }
  checks.push({ key: "worker", label: "عامل النشر", state: isPublishingEnabled() ? "healthy" : "warning", detail: isPublishingEnabled() ? "النشر الحقيقي مفعّل" : "وضع الاختبار — لا نشر فعلي" });
  checks.push({ key: "storage", label: "التخزين", state: storageProvider.configured() ? "healthy" : "warning", detail: storageProvider.configured() ? "Vercel Blob مُعد" : "الرفع غير مفعّل؛ أضف الصور بروابط مباشرة" });
  return { checks, lastRunSeconds, publishingEnabled: isPublishingEnabled() };
}

export function formatAgo(seconds: number) {
  if (seconds < 60) return `${seconds} ثانية`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ساعة`;
  return `${Math.round(seconds / 86400)} يوم`;
}

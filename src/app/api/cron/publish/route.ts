import { NextResponse } from "next/server";
import { publishDuePosts } from "@/services/publisher";
import { getDb } from "@/db";
import { schedulerRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { sendAlert } from "@/services/alerts";
import { inspectGraphToken, isGraphConfigured } from "@/services/facebook-graph";
import { purgeExpiredTrash } from "@/services/trash";
import { materializeRecurrences } from "@/services/recurrence";

const GAP_ALERT_MINUTES = 10;

/** Health checks that run alongside the worker; failures here never block publishing. */
async function runHealthChecks() {
  try {
    const [previous] = await getDb().select({ triggeredAt: schedulerRuns.triggeredAt }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1);
    const gapMinutes = previous ? Math.round((Date.now() - previous.triggeredAt.getTime()) / 60000) : 0;
    if (gapMinutes > GAP_ALERT_MINUTES) await sendAlert("scheduler_gap", "توقف عامل النشر ثم عاد", `لم يعمل عامل النشر لمدة ${gapMinutes} دقيقة. المنشورات المستحقة خلال التوقف تُنشر الآن. تحقق من مهمة cron-job.org إذا تكرر هذا.`, 1);
    // Token inspection is a network call; once an hour is enough.
    if (new Date().getUTCMinutes() === 0) await purgeExpiredTrash();
    if (isGraphConfigured() && new Date().getUTCMinutes() === 0) {
      const token = await inspectGraphToken();
      if (!token.valid) await sendAlert("token_invalid", "توكن فيسبوك غير صالح", `النشر سيفشل حتى تولّد توكناً جديداً وتضعه في META_PAGE_ACCESS_TOKEN على Vercel.

السبب: ${token.reason ?? "غير معروف"}`, 24);
      else if (token.expiresAt && token.expiresAt.getTime() - Date.now() < 7 * 86400 * 1000) await sendAlert("token_expiring", "توكن فيسبوك ينتهي قريباً", `ينتهي التوكن في ${token.expiresAt.toISOString().slice(0, 10)}. مدّده من أداة تصحيح رموز الوصول في Meta، ثم حدّث META_PAGE_ACCESS_TOKEN على Vercel.`, 24);
    }
  } catch (error) {
    console.error("Health checks failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function run(request: Request) {
  // Dashboard-entered values often carry stray whitespace or quotes; normalize both sides before comparing.
  const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const expected = clean(process.env.CRON_SECRET);
  const provided = clean(clean(request.headers.get("authorization")).replace(/^bearer\s+/i, ""));
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  await runHealthChecks();
  // Recurring rules create their upcoming instances before the due-post scan.
  await materializeRecurrences().catch((error) => console.error("Recurrence materialization failed", { error: error instanceof Error ? error.message : String(error) }));
  try {
    const results = await publishDuePosts();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await getDb().insert(schedulerRuns).values({ finishedAt, processedCount: results.length, publishedCount: results.filter((item) => item.status === "published").length, failedCount: results.filter((item) => item.status === "failed").length, durationMs, status: "success" });
    return NextResponse.json({ success: true, processed: results.length, published_count: results.filter((item) => item.status === "published").length, failed_count: results.filter((item) => item.status === "failed").length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker failed";
    try { await getDb().insert(schedulerRuns).values({ finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), status: "failed", errorMessage: message }); } catch { /* preserve the worker error response */ }
    return NextResponse.json({ error: "تعذر تشغيل عامل النشر" }, { status: 500 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

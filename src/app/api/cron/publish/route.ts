import { after, NextResponse } from "next/server";
import { publishDuePosts } from "@/services/publisher";
import { getDb } from "@/db";
import { facebookPages, schedulerRuns } from "@/db/schema";
import { storedPageToken } from "@/services/page-tokens";
import { and, desc, eq } from "drizzle-orm";
import { sendAlert } from "@/services/alerts";
import { inspectGraphToken, isGraphConfigured } from "@/services/facebook-graph";
import { purgeExpiredTrash } from "@/services/trash";
import { materializeRecurrences } from "@/services/recurrence";
import { syncComments } from "@/services/comments/store";
import { maybeSendWeeklyReport } from "@/services/weekly-report";
import { syncMessenger } from "@/services/messenger";

// The worker runs every 10 minutes (lets the free database sleep between runs).
const GAP_ALERT_MINUTES = 25;
// Hourly jobs run on the first worker call of each hour.
const firstRunOfHour = () => new Date().getUTCMinutes() < 10;

async function hasMetaAccess() {
  if (isGraphConfigured()) return true;
  const [page] = await getDb().select({ token: facebookPages.accessTokenEnc }).from(facebookPages)
    .where(and(eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true)))
    .limit(1);
  return Boolean(page?.token);
}

/** Health checks that run alongside the worker; failures here never block publishing. */
async function runHealthChecks() {
  try {
    const [previous] = await getDb().select({ triggeredAt: schedulerRuns.triggeredAt }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1);
    const gapMinutes = previous ? Math.round((Date.now() - previous.triggeredAt.getTime()) / 60000) : 0;
    if (gapMinutes > GAP_ALERT_MINUTES) await sendAlert("scheduler_gap", "توقف عامل النشر ثم عاد", `لم يعمل عامل النشر لمدة ${gapMinutes} دقيقة. المنشورات المستحقة خلال التوقف تُنشر الآن. تحقق من مهمة cron-job.org إذا تكرر هذا.`, 1);
    // Token inspection is a network call; once an hour is enough.
    if (firstRunOfHour()) await purgeExpiredTrash();
    await maybeSendWeeklyReport().catch((error) => console.error("Weekly report failed", { error: error instanceof Error ? error.message : String(error) }));
    if (firstRunOfHour()) {
      const pages = await getDb().select({
        name: facebookPages.name,
        facebookPageId: facebookPages.facebookPageId,
        hasStoredToken: facebookPages.accessTokenEnc,
      }).from(facebookPages).where(and(eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true)));
      for (const page of pages) {
        const saved = await storedPageToken(page.facebookPageId).catch(() => null);
        if (!saved && !isGraphConfigured()) {
          await sendAlert("token_invalid", `صفحة ${page.name} تحتاج إعادة ربط`, "لا يوجد توكن OAuth صالح محفوظ لهذه الصفحة. افتح الصفحات والحسابات واضغط «ربط Facebook وInstagram».", 24);
          continue;
        }
        const token = await inspectGraphToken(saved ?? undefined);
        const fix = "أعد ربط الحساب من الصفحات والحسابات ← ربط Facebook وInstagram.";
        if (!token.valid) await sendAlert("token_invalid", `رمز صفحة ${page.name} غير صالح`, `النشر على هذه الصفحة سيفشل. ${fix}

السبب: ${token.reason ?? "غير معروف"}`, 24);
        else if (token.expiresAt && token.expiresAt.getTime() - Date.now() < 7 * 86400 * 1000) await sendAlert("token_expiring", `رمز صفحة ${page.name} ينتهي قريباً`, `ينتهي في ${token.expiresAt.toISOString().slice(0, 10)}. ${fix}`, 24);
      }
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
  // Publishing comes first; everything else runs after the response so it can never delay a post.
  const gapCheck = runHealthChecks();
  // Recurring rules create their upcoming instances before the due-post scan.
  await materializeRecurrences().catch((error) => console.error("Recurrence materialization failed", { error: error instanceof Error ? error.message : String(error) }));
  after(async () => {
    const log = (label: string) => (error: unknown) => console.error(label, { error: error instanceof Error ? error.message : String(error) });
    await gapCheck;
    if (!(await hasMetaAccess())) return;
    const day = (offset: number) => new Date(startedAt.getTime() - offset * 86400000).toISOString().slice(0, 10);
    await syncComments(day(2), day(0)).catch(log("Comments sync failed"));
    await syncMessenger().catch(log("Messenger sync failed"));
  });
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

export const maxDuration = 60;
export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

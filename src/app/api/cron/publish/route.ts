import { after, NextResponse } from "next/server";
import { publishDuePosts } from "@/services/publisher";
import { getDb } from "@/db";
import { facebookPages, schedulerRuns } from "@/db/schema";
import { storedPageToken } from "@/services/page-tokens";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { resolveAlerts, sendAlert } from "@/services/alerts";
import { inspectGraphToken, isGraphConfigured } from "@/services/facebook-graph";
import { purgeExpiredTrash } from "@/services/trash";
import { materializeRecurrences } from "@/services/recurrence";
import { processDueAutomationReplies, syncComments } from "@/services/comments/store";
import { maybeSendWeeklyReport } from "@/services/weekly-report";
import { syncMessenger } from "@/services/messenger";
import { checkMetaWebhookSubscriptions } from "@/services/meta-webhook";
import { deliverLeadFollowups } from "@/services/leads-followup-worker";
import { enqueueHourlyTechNews } from "@/services/tech-news";

// The worker runs every 10 minutes (lets the free database sleep between runs).
const GAP_ALERT_MINUTES = 25;
// Hourly jobs run on the first worker call of each hour.
const firstRunOfHour = () => new Date().getUTCMinutes() < 10;

async function hasMetaAccess() {
  if (isGraphConfigured()) return true;
  const [page] = await getDb().select({ token: facebookPages.accessTokenEnc }).from(facebookPages)
    .where(and(
      eq(facebookPages.platform, "facebook"),
      eq(facebookPages.isActive, true),
      isNotNull(facebookPages.accessTokenEnc),
    ))
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
      try {
        const webhook = await checkMetaWebhookSubscriptions();
        if (webhook.configured && webhook.healthy) {
          await resolveAlerts(["webhook_disconnected"]);
        } else if (webhook.configured) {
          const failedPages = webhook.pages.filter((page) => !page.ok).map((page) => page.page).join("، ");
          await sendAlert(
            "webhook_disconnected",
            "Webhook Facebook يحتاج إعادة تفعيل",
            `اشتراك التطبيق: ${webhook.app ? "سليم" : "غير سليم"}${failedPages ? ` · صفحات متأثرة: ${failedPages}` : ""}. افتح التكاملات واضغط «تفعيل Webhook الآن».`,
            6,
          );
        }
      } catch (error) {
        console.error("Meta webhook health check failed", { error: error instanceof Error ? error.message : String(error) });
      }
    }

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
        const missingPublishScope = token.scopes.length > 0 && !token.scopes.includes("pages_manage_posts");
        if (!token.valid) await sendAlert("token_invalid", `رمز صفحة ${page.name} غير صالح`, `النشر على هذه الصفحة سيفشل. ${fix}

السبب: ${token.reason ?? "غير معروف"}`, 24);
        else if (missingPublishScope) await sendAlert("token_invalid", `صلاحية النشر ناقصة لصفحة ${page.name}`, `التوكن صالح لكن pages_manage_posts غير موجودة. ${fix}`, 24);
        else if (token.expiresAt && token.expiresAt.getTime() - Date.now() < 7 * 86400 * 1000) await sendAlert("token_expiring", `رمز صفحة ${page.name} ينتهي قريباً`, `ينتهي في ${token.expiresAt.toISOString().slice(0, 10)}. ${fix}`, 24);
        else await resolveAlerts(["token_invalid", "token_expiring"], page.name);
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
    await deliverLeadFollowups().catch(() => console.error("Lead follow-up dispatch failed", { code: "LEAD_FOLLOWUP_DISPATCH_FAILED" }));
    if (!(await hasMetaAccess())) return;
    const day = (offset: number) => new Date(startedAt.getTime() - offset * 86400000).toISOString().slice(0, 10);
    try {
      const comments = await syncComments(day(2), day(0));
      if ("errors" in comments && Array.isArray(comments.errors) && comments.errors.length) {
        await sendAlert("comments_sync_failed", "مزامنة التعليقات جزئية", comments.errors.join("\n").slice(0, 900), 6);
      } else {
        await resolveAlerts(["comments_sync_failed"]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendAlert("comments_sync_failed", "تعذر مزامنة التعليقات", message.slice(0, 900), 6);
      log("Comments sync failed")(error);
    }

    try {
      const autoReplies = await processDueAutomationReplies();
      if (autoReplies.failed > 0) {
        await sendAlert("comments_sync_failed", "بعض الردود التلقائية لم تُرسل", `فشل ${autoReplies.failed} من أصل ${autoReplies.processed} رد تلقائي مستحق.`, 1);
      }
    } catch (error) {
      log("Automatic comment replies failed")(error);
    }

    try {
      const messenger = await syncMessenger();
      const failed = Object.entries(messenger.status).filter(([, error]) => Boolean(error));
      if (failed.length) {
        await sendAlert("messenger_sync_failed", "مزامنة Messenger غير مكتملة", failed.map(([name, error]) => `${name}: ${error}`).join("\n").slice(0, 900), 6);
      } else {
        await resolveAlerts(["messenger_sync_failed"]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendAlert("messenger_sync_failed", "تعذر مزامنة Messenger", message.slice(0, 900), 6);
      log("Messenger sync failed")(error);
    }
  });
  try {
    try {
      const techNews = await enqueueHourlyTechNews(startedAt);
      if (techNews.created) console.info("Hourly technology news queued", { postId: techNews.postId, source: techNews.source });
    } catch (error) {
      console.error("Hourly technology news failed", { error: error instanceof Error ? error.message : String(error) });
    }
    const results = await publishDuePosts();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await getDb().insert(schedulerRuns).values({ finishedAt, processedCount: results.length, publishedCount: results.filter((item) => item.status === "published").length, failedCount: results.filter((item) => item.status === "failed").length, durationMs, status: "success" });
    await resolveAlerts(["scheduler_gap"]);
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

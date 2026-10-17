import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, publicationAttempts } from "@/db/schema";
import { publishToFacebook, type FacebookResult } from "./facebook";
import { resolveAlerts, sendAlert } from "./alerts";
import { classifyError } from "./error-classes";
import {ordinaryExperimentAllowed} from './reach-experiment-queries';
import {takeExperimentBudget,getReachExperiment} from './reach-experiment';
import {activeExperiment,experimentTag} from './reach-experiment-model';
import {logAudit} from './audit';

const MAX_AUTOMATIC_ATTEMPTS = 3;
const AUTO_RETRY_MINUTES = [5, 15];

function automaticRetryDelay(attemptNumber: number, message: string) {
  const kind = classifyError(message);
  const transient = kind.key === "connection" || kind.key === "database" || kind.key === "scheduler";
  if (!transient || attemptNumber >= MAX_AUTOMATIC_ATTEMPTS) return null;
  return AUTO_RETRY_MINUTES[Math.min(attemptNumber - 1, AUTO_RETRY_MINUTES.length - 1)] ?? 15;
}

export async function publishDuePosts(limit = 10) {
  const db = getDb();
  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), isNull(posts.deletedAt), lte(posts.scheduledAt, new Date()))).orderBy(asc(posts.scheduledAt)).limit(limit);
  const results: Array<{ id: string; status: string }> = [];
  const experiment=await getReachExperiment();
  for (const candidate of due) {
    const trialTagged=candidate.tags.some(t=>t.startsWith('reach-experiment:'));
    if(trialTagged&&(!activeExperiment(experiment,candidate.pageId)||!candidate.tags.includes(experimentTag(experiment!.id)))){
      await db.update(posts).set({status:'draft',lastError:'REACH_EXPERIMENT_ENDED: انتهت تجربة الخبر؛ محفوظ للمراجعة',updatedAt:new Date()}).where(and(eq(posts.id,candidate.id),eq(posts.status,'scheduled')));
      results.push({id:candidate.id,status:'experiment_held'});continue;
    }
    const allowed=ordinaryExperimentAllowed(sql`${posts.pageId}`,sql`${posts.tags}`,sql`${posts.category}`);
    const held=await db.update(posts).set({status:'draft',lastError:'REACH_EXPERIMENT_HOLD: خبر خارج مسار التجربة؛ محفوظ للمراجعة دون حذف',updatedAt:new Date()}).where(and(eq(posts.id,candidate.id),eq(posts.status,'scheduled'),sql`NOT (${allowed})`)).returning({id:posts.id});
    if(held.length){await logAudit('reach_experiment.news_held','post',candidate.id,{reason:'EXCLUSIVE_NEWS_PIPELINE'});results.push({id:candidate.id,status:'experiment_held'});continue;}
    const claimed = await db.update(posts).set({ status: "publishing", updatedAt: new Date() }).where(and(eq(posts.id, candidate.id), eq(posts.status, "scheduled"), isNull(posts.deletedAt), lte(posts.scheduledAt,new Date()),allowed)).returning();
    if (!claimed.length) continue;
    const post=claimed[0];
    let budgetAllowed=true;
    try{
      if(post.category==='أخبار'||post.tags.some(t=>t.startsWith('source:')))budgetAllowed=await takeExperimentBudget(post.pageId,post.id);
    }catch{
      // No external request has started; release this claim for a later safe retry.
      await db.update(posts).set({status:'scheduled',lastError:'REACH_EXPERIMENT_BUDGET_UNAVAILABLE',updatedAt:new Date()}).where(and(eq(posts.id,post.id),eq(posts.status,'publishing')));
      results.push({id:post.id,status:'budget_unavailable'});continue;
    }
    if(!budgetAllowed){
      await db.update(posts).set({status:'draft',lastError:'REACH_EXPERIMENT_DAILY_LIMIT: اكتملت حصة الأخبار اليومية؛ محفوظ للمراجعة',updatedAt:new Date()}).where(eq(posts.id,post.id));
      await logAudit('reach_experiment.news_held','post',post.id,{reason:'DAILY_LIMIT_NO_SEND'});
      results.push({id:post.id,status:'experiment_held'});continue;
    }
    const startedAt = new Date();
    const [previousAttempts] = await db.select({ maximum: sql<number>`coalesce(max(${publicationAttempts.attemptNumber}), 0)` }).from(publicationAttempts).where(eq(publicationAttempts.postId, post.id));
    const attemptNumber = Number(previousAttempts.maximum) + 1;
    const attemptId=crypto.randomUUID();
    // Persist intent before the external write so an interrupted process is visible.
    await db.insert(publicationAttempts).values({id:attemptId,postId:post.id,attemptNumber,status:"started",startedAt});
    let result:FacebookResult;
    try {
      const [page] = await db.select().from(facebookPages).where(eq(facebookPages.id, post.pageId));
      if (!page?.isActive) throw new Error("FACEBOOK_ORGANIC_AUTH_REQUIRED: target page is unavailable");
      const media = await db.select().from(postMedia).where(eq(postMedia.postId, post.id));
      if (media.length > 1) throw new Error("MCP_MEDIA_UNSUPPORTED: multiple attachments cannot be published by this action");
      if (media.some(item => item.type !== "image" && item.type !== "video")) throw new Error("MCP_MEDIA_UNSUPPORTED: only images and videos are supported");
      const attachment = media[0];
      result = await publishToFacebook({ pageId: page.facebookPageId, content: post.content, imageUrl: attachment?.type === "image" ? attachment.url : undefined, videoUrl: attachment?.type === "video" ? attachment.url : undefined, platform: page.platform });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publication error";
      const unknown = message.startsWith("MCP_PUBLISH_OUTCOME_UNKNOWN");
      const retryMinutes = unknown ? null : automaticRetryDelay(attemptNumber, message);
      const retryAt = retryMinutes ? new Date(Date.now() + retryMinutes * 60000) : null;

      await db.batch([
        db.update(publicationAttempts).set({
          status: unknown ? "outcome_unknown" : "failed",
          finishedAt: new Date(),
          errorMessage: message,
        }).where(eq(publicationAttempts.id, attemptId)),
        db.update(posts).set(retryAt ? {
          status: "scheduled",
          scheduledAt: retryAt,
          lastError: message,
          failedAt: null,
          updatedAt: new Date(),
        } : {
          status: "failed",
          lastError: message,
          failedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(posts.id, post.id)),
      ]);

      if (retryAt) {
        results.push({ id: post.id, status: "retry_scheduled" });
        await sendAlert(
          "publish_retry_scheduled",
          `إعادة محاولة تلقائية لمنشور (${post.id.slice(0, 8)})`,
          `تعذر النشر بسبب خطأ مؤقت. ستتم المحاولة ${attemptNumber + 1} من ${MAX_AUTOMATIC_ATTEMPTS} بعد ${retryMinutes} دقائق.

الخطأ: ${message.slice(0, 400)}`,
          1,
        );
        continue;
      }

      results.push({ id: post.id, status: "failed" });
      const when = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(post.scheduledAt ?? new Date());
      await sendAlert("publish_failed", `فشل نشر منشور (${post.id.slice(0, 8)})`, `${unknown ? "نتيجة النشر غير مؤكدة: تحقق من الصفحة قبل إعادة المحاولة." : "لم يُنشر المنشور بعد استنفاد المحاولات الآمنة."}

الموعد: ${when}
النص: ${post.content.slice(0, 120)}

الخطأ: ${message.slice(0, 500)}`);
      continue;
    }
    // Commit both records atomically. If persistence fails after a successful write,
    // keep the claim and started attempt; never reclassify it as a safe-to-retry failure.
    await db.batch([
      db.update(publicationAttempts).set({status:result.dryRun?"DRY_RUN_SUCCESS":"success",finishedAt:new Date(),facebookResponse:result,facebookPostId:result.dryRun?null:result.id}).where(eq(publicationAttempts.id,attemptId)),
      db.update(posts).set({status:result.dryRun?"draft":"published",facebookPostId:result.dryRun?null:result.id,facebookPermalink:result.permalink,publishedAt:result.dryRun?null:new Date(),lastError:null,failedAt:null,updatedAt:new Date()}).where(eq(posts.id,post.id)),
    ]);
    results.push({id:post.id,status:result.dryRun?"dry_run":"published"});
    if(!result.dryRun)await sendAlert("published",`تم نشر منشور (${post.id.slice(0,8)})`,`${post.content.slice(0,120)}${result.permalink?`

${result.permalink}`:""}`,0);
  }
  return results;
}

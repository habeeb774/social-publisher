import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, publicationAttempts } from "@/db/schema";
import { publishToFacebook, type FacebookResult } from "./facebook";
import { sendAlert } from "./alerts";

export async function publishDuePosts(limit = 10) {
  const db = getDb();
  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), isNull(posts.deletedAt), lte(posts.scheduledAt, new Date()))).orderBy(asc(posts.scheduledAt)).limit(limit);
  const results: Array<{ id: string; status: string }> = [];
  for (const candidate of due) {
    const claimed = await db.update(posts).set({ status: "publishing", updatedAt: new Date() }).where(and(eq(posts.id, candidate.id), eq(posts.status, "scheduled"), isNull(posts.deletedAt), lte(posts.scheduledAt,new Date()))).returning();
    if (!claimed.length) continue;
    const post=claimed[0];
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
      if (media.some(item => item.type !== "image")) throw new Error("MCP_MEDIA_UNSUPPORTED: only images are supported");
      result = await publishToFacebook({ pageId: page.facebookPageId, content: post.content, imageUrl: media[0]?.url, platform: page.platform });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publication error";
      const unknown=message.startsWith("MCP_PUBLISH_OUTCOME_UNKNOWN");
      await db.batch([
        db.update(publicationAttempts).set({status:unknown?"outcome_unknown":"failed",finishedAt:new Date(),errorMessage:message}).where(eq(publicationAttempts.id,attemptId)),
        db.update(posts).set({ status: "failed", lastError: message, failedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, post.id)),
      ]);
      results.push({ id: post.id, status: "failed" });
      const when = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(post.scheduledAt ?? new Date());
      await sendAlert("publish_failed", `فشل نشر منشور (${post.id.slice(0, 8)})`, `${unknown ? "نتيجة النشر غير مؤكدة: تحقق من الصفحة قبل إعادة المحاولة." : "لم يُنشر المنشور."}

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

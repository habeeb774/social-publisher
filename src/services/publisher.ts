import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, publicationAttempts } from "@/db/schema";
import { publishToFacebook } from "./facebook";

export async function publishDuePosts(limit = 10) {
  const db = getDb();
  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), isNull(posts.deletedAt), lte(posts.scheduledAt, new Date()))).orderBy(asc(posts.scheduledAt)).limit(limit);
  const results: Array<{ id: string; status: string }> = [];
  for (const post of due) {
    const claimed = await db.update(posts).set({ status: "publishing", updatedAt: new Date() }).where(and(eq(posts.id, post.id), eq(posts.status, "scheduled"), isNull(posts.deletedAt))).returning({ id: posts.id });
    if (!claimed.length) continue;
    const startedAt = new Date();
    const [previousAttempts] = await db.select({ maximum: sql<number>`coalesce(max(${publicationAttempts.attemptNumber}), 0)` }).from(publicationAttempts).where(eq(publicationAttempts.postId, post.id));
    const attemptNumber = Number(previousAttempts.maximum) + 1;
    try {
      const [page] = await db.select().from(facebookPages).where(eq(facebookPages.id, post.pageId));
      if (!page?.isActive) throw new Error("FACEBOOK_ORGANIC_AUTH_REQUIRED: target page is unavailable");
      const media = await db.select().from(postMedia).where(eq(postMedia.postId, post.id));
      if (media.length > 1) throw new Error("MCP_MEDIA_UNSUPPORTED: multiple attachments cannot be published by this action");
      if (media.some(item => item.type !== "image")) throw new Error("MCP_MEDIA_UNSUPPORTED: only images are supported");
      const result = await publishToFacebook({ pageId: page.facebookPageId, content: post.content, imageUrl: media[0]?.url });
      await db.insert(publicationAttempts).values({ postId: post.id, attemptNumber, status: result.dryRun ? "DRY_RUN_SUCCESS" : "success", startedAt, finishedAt: new Date(), facebookResponse: result });
      await db.update(posts).set({ status: result.dryRun ? "draft" : "published", facebookPostId: result.dryRun ? null : result.id, facebookPermalink: result.permalink, publishedAt: result.dryRun ? null : new Date(), updatedAt: new Date() }).where(eq(posts.id, post.id));
      results.push({ id: post.id, status: result.dryRun ? "dry_run" : "published" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publication error";
      await db.insert(publicationAttempts).values({ postId: post.id, attemptNumber, status: "failed", startedAt, finishedAt: new Date(), errorMessage: message });
      await db.update(posts).set({ status: "failed", lastError: message, failedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, post.id));
      results.push({ id: post.id, status: "failed" });
    }
  }
  return results;
}

import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts } from "@/db/schema";
import { publishToFacebook } from "./facebook";

export async function publishDuePosts(limit = 10) {
  const db = getDb();
  const due = await db.select().from(posts).where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date()))).limit(limit);
  const results: Array<{ id: string; status: string }> = [];
  for (const post of due) {
    const claimed = await db.update(posts).set({ status: "publishing", updatedAt: new Date() }).where(and(eq(posts.id, post.id), eq(posts.status, "scheduled"))).returning({ id: posts.id });
    if (!claimed.length) continue;
    const startedAt = new Date();
    try {
      const result = await publishToFacebook({ pageId: process.env.META_PAGE_ID ?? "", content: post.content });
      await db.insert(publicationAttempts).values({ postId: post.id, attemptNumber: 1, status: result.dryRun ? "DRY_RUN_SUCCESS" : "success", startedAt, finishedAt: new Date(), facebookResponse: result });
      await db.update(posts).set({ status: result.dryRun ? "scheduled" : "published", facebookPostId: result.dryRun ? null : result.id, facebookPermalink: result.permalink, publishedAt: result.dryRun ? null : new Date(), updatedAt: new Date() }).where(eq(posts.id, post.id));
      results.push({ id: post.id, status: result.dryRun ? "dry_run" : "published" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publication error";
      await db.insert(publicationAttempts).values({ postId: post.id, attemptNumber: 1, status: "failed", startedAt, finishedAt: new Date(), errorMessage: message });
      await db.update(posts).set({ status: "failed", lastError: message, failedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, post.id));
      results.push({ id: post.id, status: "failed" });
    }
  }
  return results;
}

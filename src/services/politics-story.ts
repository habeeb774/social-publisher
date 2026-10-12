import { and, arrayContains, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, settings } from "@/db/schema";
import { logAudit } from "./audit";
import { publishGraphPhotoStory } from "./facebook-graph";
import { isPublishingEnabled } from "./publishing-mode";
import { isYemenNews } from "./politics-editorial";
import { politicsTargetPage } from "./politics-autopost";

/** The most important politics post published on the page since `since`: Yemeni news first, then the newest. */
export async function topRecentPoliticsPost(pageId: string, since: Date) {
  const recent = await getDb().select({ id: posts.id, content: posts.content }).from(posts)
    .where(and(eq(posts.pageId, pageId), eq(posts.status, "published"), isNull(posts.deletedAt), arrayContains(posts.tags, ["سياسة"]), gte(posts.publishedAt, since)))
    .orderBy(desc(posts.publishedAt)).limit(20);
  return recent.find((post) => isYemenNews(post.content.split("\n")[0] ?? "")) ?? recent[0] ?? null;
}

/** One story every few hours: a story per post would flood followers' story tray. */
const INTERVAL_MS = 3 * 3600000;

/**
 * Shares the most important politics post published on رَصْدُوق in the current window as a
 * Facebook Story (vertical headline card). Yemeni news first, then the newest.
 */
export async function publishPoliticsStory(now = new Date()) {
  if (!isPublishingEnabled()) return { published: false as const, reason: "PUBLISHING_DISABLED" };
  const db = getDb();
  const slotKey = `politics_story_slot:${Math.floor(now.getTime() / INTERVAL_MS)}`;
  const [done] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, slotKey)).limit(1);
  if (done) return { published: false as const, reason: "SLOT_DONE" };

  const page = await politicsTargetPage();
  if (!page) return { published: false as const, reason: "POLITICS_PAGE_UNAVAILABLE" };
  const chosen = await topRecentPoliticsPost(page.id, new Date(now.getTime() - INTERVAL_MS));
  if (!chosen) return { published: false as const, reason: "NO_RECENT_POST" };

  // Claim the slot before the external call so concurrent ticks cannot post two stories.
  const claim = await db.insert(settings).values({ key: slotKey, value: JSON.stringify({ postId: chosen.id, claimedAt: now.toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
  if (!claim.length) return { published: false as const, reason: "SLOT_DONE" };
  const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
  try {
    const story = await publishGraphPhotoStory(page.facebookPageId, `${appUrl}/api/politics-news-image/${chosen.id}?format=story`);
    await logAudit("politics_story.published", "post", chosen.id, { storyId: story.id, pageId: page.facebookPageId });
    return { published: true as const, postId: chosen.id, storyId: story.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The slot stays claimed: a failed or uncertain story is not retried until the next window.
    await logAudit("politics_story.failed", "post", chosen.id, { error: message.slice(0, 300) });
    return { published: false as const, reason: "STORY_FAILED", error: message };
  }
}

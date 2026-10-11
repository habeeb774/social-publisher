import { createHash } from "node:crypto";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, settings } from "@/db/schema";
import { logAudit } from "./audit";
import { rankRadar } from "./tech-radar-ranking";
import { editorialPoliticsPost, eligiblePoliticsArticle, politicsRisk } from "./politics-editorial";
import { readPoliticsFeeds } from "./politics-radar";

/** Only stories this fresh are auto-posted, so a restart never floods the page with old news. */
const MAX_AGE_MS = 3 * 3600000;
/** Feeds are read once per hour; the stories found are spread across that hour. */
const MAX_PER_HOUR = 6;
const SPACING_MS = 10 * 60000;

function articleHash(url: string) { return createHash("sha256").update(url).digest("hex").slice(0, 20); }

/** Set POLITICS_FACEBOOK_PAGE_ID to the page's Facebook ID; until then the page is found by its current name. */
async function targetPage() {
  const pageId = process.env.POLITICS_FACEBOOK_PAGE_ID?.trim();
  // The page name may be stored with or without Arabic diacritics.
  const where = pageId ? eq(facebookPages.facebookPageId, pageId) : or(ilike(facebookPages.name, "%رَصْدُوق%"), ilike(facebookPages.name, "%رصدوق%"), ilike(facebookPages.name, "%منوع%"));
  const [page] = await getDb().select({ id: facebookPages.id, facebookPageId: facebookPages.facebookPageId }).from(facebookPages).where(and(where, eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true))).limit(1);
  return page ?? null;
}

/**
 * Once per hour: reads the feeds and schedules up to MAX_PER_HOUR new stories, 10 minutes apart.
 * Other scheduler ticks return after a single settings lookup, without fetching any feed.
 * Casualty reports are never auto-posted; they stay on the radar for manual review.
 */
export async function enqueuePoliticsNews(now = new Date()) {
  const db = getDb();
  const claimKey = `politics_news_hour:${now.toISOString().slice(0, 13)}`;
  const [existingClaim] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, claimKey)).limit(1);
  if (existingClaim) return { created: 0, reason: "HOUR_ALREADY_CLAIMED" as const };
  const claim = await db.insert(settings).values({ key: claimKey, value: JSON.stringify({ claimedAt: now.toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
  if (!claim.length) return { created: 0, reason: "HOUR_ALREADY_CLAIMED" as const };

  const page = await targetPage();
  if (!page) {
    await logAudit("politics_news.skipped", "post", null, { reason: "POLITICS_PAGE_UNAVAILABLE" });
    return { created: 0, reason: "POLITICS_PAGE_UNAVAILABLE" as const };
  }

  const feeds = await readPoliticsFeeds();
  const candidates = rankRadar(feeds.flatMap((f) => f.items), now, eligiblePoliticsArticle)
    .filter((g) => politicsRisk(g.title) === "normal" && now.getTime() - g.articles[0].publishedAt.getTime() <= MAX_AGE_MS)
    .sort((a, b) => b.articles[0].publishedAt.getTime() - a.articles[0].publishedAt.getTime());
  const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
  let created = 0;
  for (const group of candidates) {
    if (created >= MAX_PER_HOUR) break;
    // Mark the whole group so the same story from another outlet is not posted again.
    const keys = group.articles.map((a) => `politics_news_seen:${articleHash(a.url)}`);
    const seen = await Promise.all(keys.map((key) => db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).limit(1)));
    if (seen.some((rows) => rows.length)) continue;
    const article = group.articles[0];
    const marked = await db.insert(settings).values({ key: keys[0], value: JSON.stringify({ url: article.url, claimedAt: now.toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
    if (!marked.length) continue;
    for (const key of keys.slice(1)) await db.insert(settings).values({ key, value: JSON.stringify({ duplicateOf: article.url }) }).onConflictDoNothing();

    const scheduledAt = new Date(now.getTime() + created * SPACING_MS);
    const [post] = await db.insert(posts).values({ pageId: page.id, content: editorialPoliticsPost(article), scheduledAt, timezone: "Asia/Riyadh", status: "scheduled", category: "أخبار", tags: ["سياسة", "أخبار", `source:${article.source}`] }).returning({ id: posts.id });
    await db.insert(postMedia).values({ postId: post.id, type: "image", url: `${appUrl}/api/politics-news-image/${post.id}`, mimeType: "image/png" });
    await logAudit("politics_news.enqueued", "post", post.id, { pageId: page.facebookPageId, source: article.source, sourceUrl: article.url, scheduledAt: scheduledAt.toISOString() });
    created++;
  }
  return created ? { created, reason: "SCHEDULED" as const } : { created: 0, reason: "NO_NEW_SAFE_NEWS" as const };
}

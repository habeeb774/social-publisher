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
 * Publishes the newest unseen political story on every scheduler tick (one per tick).
 * Sensitive (violent) stories are never auto-posted; they stay on the radar for manual review.
 */
export async function enqueuePoliticsNews(now = new Date()) {
  const db = getDb();
  const feeds = await readPoliticsFeeds();
  const candidates = rankRadar(feeds.flatMap((f) => f.items), now, eligiblePoliticsArticle)
    .filter((g) => politicsRisk(g.title) === "normal" && now.getTime() - g.articles[0].publishedAt.getTime() <= MAX_AGE_MS)
    .sort((a, b) => b.articles[0].publishedAt.getTime() - a.articles[0].publishedAt.getTime());
  let selected = null;
  for (const group of candidates) {
    // Mark the whole group so the same story from another outlet is not posted again.
    const keys = group.articles.map((a) => `politics_news_seen:${articleHash(a.url)}`);
    const seen = await Promise.all(keys.map((key) => db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).limit(1)));
    if (seen.some((rows) => rows.length)) continue;
    const claim = await db.insert(settings).values({ key: keys[0], value: JSON.stringify({ url: group.articles[0].url, claimedAt: now.toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
    if (!claim.length) continue;
    for (const key of keys.slice(1)) await db.insert(settings).values({ key, value: JSON.stringify({ duplicateOf: group.articles[0].url }) }).onConflictDoNothing();
    selected = group.articles[0];
    break;
  }
  if (!selected) return { created: false, reason: "NO_NEW_SAFE_NEWS" as const };

  const page = await targetPage();
  if (!page) {
    await logAudit("politics_news.skipped", "post", null, { reason: "POLITICS_PAGE_UNAVAILABLE", sourceUrl: selected.url });
    return { created: false, reason: "POLITICS_PAGE_UNAVAILABLE" as const };
  }
  const [post] = await db.insert(posts).values({ pageId: page.id, content: editorialPoliticsPost(selected), scheduledAt: now, timezone: "Asia/Riyadh", status: "scheduled", category: "أخبار", tags: ["سياسة", "أخبار", `source:${selected.source}`] }).returning({ id: posts.id });
  const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
  await db.insert(postMedia).values({ postId: post.id, type: "image", url: `${appUrl}/api/politics-news-image/${post.id}`, mimeType: "image/png" });
  await logAudit("politics_news.enqueued", "post", post.id, { pageId: page.facebookPageId, source: selected.source, sourceUrl: selected.url });
  return { created: true, postId: post.id, source: selected.source, title: selected.title };
}

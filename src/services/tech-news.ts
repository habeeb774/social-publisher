import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, settings } from "@/db/schema";
import { logAudit } from "./audit";
import { eligibleTechArticle, editorialTechPost } from "./tech-news-editorial";

const HABEEB_FACEBOOK_PAGE_ID = "1330947143441946";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

type FeedSource = { name: string; url: string; topic: string };
export type FeedItem = { title: string; url: string; publishedAt: Date; source: string; topic: string };

const FEEDS: FeedSource[] = [
  { name: "البوابة العربية للأخبار التقنية", url: "https://aitnews.com/feed/", topic: "أدوات العمل" },
  { name: "WIRED", url: "https://www.wired.com/feed/rss", topic: "تقنية" },
  { name: "WIRED AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", topic: "ذكاء اصطناعي" },
  { name: "WIRED Security", url: "https://www.wired.com/feed/category/security/latest/rss", topic: "أمن سيبراني" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", topic: "تقنية" },
];

function decodeXml(value: string) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();
}
function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}
export function parseFeed(xml: string, source: FeedSource): FeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, 30)) {
    const title = tag(block, "title");
    const rssLink = tag(block, "link");
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const url = decodeXml(rssLink || atomLink);
    const dateText = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    const publishedAt = dateText ? new Date(dateText) : new Date(0);
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(publishedAt.getTime())) continue;
    items.push({ title, url, publishedAt, source: source.name, topic: source.topic });
  }
  return items;
}
async function readFeed(source: FeedSource) {
  try {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return parseFeed(await response.text(), source);
  } catch (error) {
    console.error("Tech news feed failed", { source: source.name, error: error instanceof Error ? error.message : String(error) });
    return [] as FeedItem[];
  }
}
function articleHash(url: string) { return createHash("sha256").update(url).digest("hex").slice(0, 20); }

export async function enqueueHourlyTechNews(now = new Date()) {
  const db = getDb();
  const hourKey = now.toISOString().slice(0, 13);
  const claimKey = `tech_news_hour:${hourKey}`;
  const feedResults = await Promise.all(FEEDS.map(readFeed));
  const cutoff = now.getTime() - MAX_AGE_MS;
  const candidates = feedResults.flat().filter((item) => eligibleTechArticle(item) && item.publishedAt.getTime() >= cutoff && item.publishedAt.getTime() <= now.getTime() + 600000).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  if (!candidates.length) {
    await logAudit("tech_news.skipped", "post", null, { reason: "NO_FRESH_NEWS", hourKey });
    return { created: false, reason: "NO_FRESH_NEWS" as const };
  }

  let selected: FeedItem | null = null;
  for (const candidate of candidates) {
    const [seen] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, `tech_news_seen:${articleHash(candidate.url)}`)).limit(1);
    if (!seen) { selected = candidate; break; }
  }
  if (!selected) return { created: false, reason: "NO_UNSEEN_NEWS" as const };

  const claim = await db.insert(settings).values({ key: claimKey, value: JSON.stringify({ claimedAt: now.toISOString(), url: selected.url }) }).onConflictDoNothing().returning({ key: settings.key });
  if (!claim.length) return { created: false, reason: "HOUR_ALREADY_CLAIMED" as const };

  const [page] = await db.select({ id: facebookPages.id }).from(facebookPages).where(and(eq(facebookPages.facebookPageId, HABEEB_FACEBOOK_PAGE_ID), eq(facebookPages.platform, "facebook"), eq(facebookPages.isActive, true))).limit(1);
  if (!page) {
    await logAudit("tech_news.skipped", "post", null, { reason: "HABEEB_PAGE_UNAVAILABLE", hourKey });
    return { created: false, reason: "HABEEB_PAGE_UNAVAILABLE" as const };
  }

  const [post] = await db.insert(posts).values({ pageId: page.id, content: editorialTechPost(selected), scheduledAt: now, timezone: "Asia/Riyadh", status: "scheduled", category: "أخبار", tags: ["تقنية", "تكنولوجيا", "أخبار التقنية", selected.topic, `source:${selected.source}`] }).returning({ id: posts.id });
  const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
  await db.insert(postMedia).values({ postId: post.id, type: "image", url: `${appUrl}/api/tech-news-image/${post.id}?v=2`, mimeType: "image/png" });
  await db.insert(settings).values({ key: `tech_news_seen:${articleHash(selected.url)}`, value: JSON.stringify({ url: selected.url, title: selected.title, source: selected.source, publishedAt: selected.publishedAt.toISOString(), postId: post.id, createdAt: now.toISOString() }) }).onConflictDoNothing();

  await logAudit("tech_news.enqueued", "post", post.id, { pageId: HABEEB_FACEBOOK_PAGE_ID, source: selected.source, sourceUrl: selected.url, publishedAt: selected.publishedAt.toISOString(), hourly: true });
  return { created: true, postId: post.id, source: selected.source, title: selected.title };
}

export const techNewsSources = FEEDS.map(({ name, url, topic }) => ({ name, url, topic }));

export async function readTechRadarFeeds() {
  return Promise.all(FEEDS.map(async (source) => {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
      if (!response.ok) throw new Error("FEED_UNAVAILABLE");
      return { source: source.name, available: true, items: parseFeed(await response.text(), source) };
    } catch {
      return { source: source.name, available: false, items: [] as FeedItem[] };
    }
  }));
}

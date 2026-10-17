import { createHash,randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, settings } from "@/db/schema";
import { logAudit } from "./audit";
import { eligibleAutomaticTechArticle, editorialTechPost,sourceNewsBrief } from "./tech-news-editorial";
import {canonicalTechUrl,techArticleKeys,enqueueTechArticleQuery} from './tech-news-dedup';
import {getReachExperiment} from './reach-experiment';
import {activeExperiment,experimentSlot,experimentTag} from './reach-experiment-model';
import { politicsTargetPage } from "./politics-autopost";
import { getGeneralSettings } from "./general-settings";

const HABEEB_FACEBOOK_PAGE_ID = "1330947143441946";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

type FeedSource = { name: string; url: string; topic: string };
export type FeedItem = { title: string; url: string; publishedAt: Date; source: string; topic: string; summary?: string };

const FEEDS: FeedSource[] = [
  { name: "البوابة العربية للأخبار التقنية", url: "https://aitnews.com/feed/", topic: "أدوات العمل" },
  { name: "WIRED", url: "https://www.wired.com/feed/rss", topic: "تقنية" },
  { name: "WIRED AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", topic: "ذكاء اصطناعي" },
  { name: "WIRED Security", url: "https://www.wired.com/feed/category/security/latest/rss", topic: "أمن سيبراني" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", topic: "تقنية" },
  { name: "عالم التقنية", url: "https://www.tech-wd.com/wd/feed/", topic: "تقنية" },
  { name: "عرب هاردوير", url: "https://arabhardware.net/feed", topic: "أجهزة" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", topic: "شركات التقنية" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", topic: "تقنية" },
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
    const summary = (tag(block, "description") || tag(block, "summary")).slice(0, 600);
    items.push({ title, url, publishedAt, source: source.name, topic: source.topic, ...(summary ? { summary } : {}) });
  }
  return items;
}
async function readFeed(source: FeedSource,fetcher:typeof fetch=fetch) {
  try {
    const response = await fetcher(source.url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return parseFeed(await response.text(), source);
  } catch (error) {
    console.error("Tech news feed failed", { source: source.name, error: error instanceof Error ? error.message : String(error) });
    return [] as FeedItem[];
  }
}
function articleHash(url: string) { return createHash("sha256").update(url).digest("hex").slice(0, 20); }

export function createTechFeedScan(fetcher:typeof fetch=fetch){
 let scan:Promise<FeedItem[][]>|undefined;
 return ()=>scan??=Promise.all(FEEDS.map(source=>readFeed(source,fetcher)));
}

export async function enqueueHourlyTechNews(now = new Date(), destination: "habeeb" | "former-politics" = "habeeb",dependencies:{readFeeds?:()=>Promise<FeedItem[][]>}={}) {
  if (!(await getGeneralSettings()).technologyNewsEnabled) return { created: false, reason: "DISABLED_BY_SETTINGS" as const };
  const db = getDb();
  const hourKey = now.toISOString().slice(0, 13);
  const namespace = destination === "former-politics" ? "tech_news_former_politics" : "tech_news";
  const page = destination === 'former-politics'?await politicsTargetPage():(await db.select({id:facebookPages.id,facebookPageId:facebookPages.facebookPageId}).from(facebookPages).where(and(eq(facebookPages.facebookPageId,HABEEB_FACEBOOK_PAGE_ID),eq(facebookPages.platform,'facebook'),eq(facebookPages.isActive,true))).limit(1))[0];
  if(!page)return {created:false,reason:'HABEEB_PAGE_UNAVAILABLE' as const};
  const experiment=await getReachExperiment(),trial=activeExperiment(experiment,page.id,now);
  const slot=trial?experimentSlot(experiment!,page.id,now):null;
  if(trial&&!slot)return {created:false,reason:'REACH_EXPERIMENT_OUTSIDE_SLOT' as const};
  const claimKey = slot??`${namespace}_hour:${hourKey}`;
  // Most scheduler ticks revisit an hour already handled. Avoid fetching and
  // parsing every feed; retain the atomic insert below for concurrent ticks.
  const [existingClaim] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, claimKey)).limit(1);
  if (existingClaim) return { created: false, reason: "HOUR_ALREADY_CLAIMED" as const };
  // At most one feed scan per 15-minute window until this hour has a post.
  const attemptKey = `${namespace}_attempt:${hourKey}:${Math.floor(now.getUTCMinutes() / 15)}`;
  const attempt = await db.insert(settings).values({ key: attemptKey, value: now.toISOString() }).onConflictDoNothing().returning({ key: settings.key });
  if (!attempt.length) return { created: false, reason: "ATTEMPT_ALREADY_RUN" as const };
  const feedResults = await (dependencies.readFeeds??createTechFeedScan())();
  const cutoff = now.getTime() - MAX_AGE_MS;
  const candidates = feedResults.flat().filter((item) => eligibleAutomaticTechArticle(item,destination) && item.publishedAt.getTime() >= cutoff && item.publishedAt.getTime() <= now.getTime() + 600000).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  if (!candidates.length) {
    await logAudit("tech_news.skipped", "post", null, { reason: "NO_FRESH_NEWS", hourKey });
    return { created: false, reason: "NO_FRESH_NEWS" as const };
  }

  const probes:Array<{item:FeedItem;keys:string[]}>=[];
  for (const candidate of candidates) {
    if(trial&&!sourceNewsBrief(candidate))continue;
    let url:string;try{url=canonicalTechUrl(candidate.url);}catch{continue;}
    const keys=techArticleKeys(page.id,url,candidate.title);
    probes.push({item:{...candidate,url},keys:[`${namespace}_seen:${articleHash(candidate.url)}`,`tech_news_seen:${articleHash(candidate.url)}`,keys.url,keys.title]});
  }
  const lookupKeys=[...new Set(probes.flatMap(p=>p.keys))];
  const seen=new Set(lookupKeys.length?(await db.select({key:settings.key}).from(settings).where(inArray(settings.key,lookupKeys))).map(r=>r.key):[]);
  const selected=probes.find(p=>p.keys.every(key=>!seen.has(key)))?.item;
  if (!selected) return { created: false, reason: "NO_UNSEEN_NEWS" as const };

  const post={id:randomUUID()},keys=techArticleKeys(page.id,selected.url,selected.title);
  const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
  const metadata=JSON.stringify({url:selected.url,title:selected.title,source:selected.source,publishedAt:selected.publishedAt.toISOString(),postId:post.id,createdAt:now.toISOString()});
  const inserted=await db.execute(enqueueTechArticleQuery({id:post.id,pageId:page.id,hourKey:claimKey,urlKey:keys.url,titleKey:keys.title,seenKey:`${namespace}_seen:${articleHash(selected.url)}`,metadata,content:editorialTechPost(selected,trial),imageUrl:`${appUrl}/api/tech-news-image/${post.id}?v=2`,tags:['تقنية',selected.topic,`source:${selected.source}`,...(trial?[experimentTag(experiment!.id)]:[])],at:now.toISOString()}));
  if(!inserted.rows.length)return {created:false,reason:'ARTICLE_OR_HOUR_ALREADY_CLAIMED' as const};

  await logAudit("tech_news.enqueued", "post", post.id, { pageId: page.facebookPageId, destination, source: selected.source, sourceUrl: selected.url, publishedAt: selected.publishedAt.toISOString(), hourly: true });
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

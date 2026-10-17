import { unstable_cache } from "next/cache";
import { parseFeed, type FeedItem } from "./tech-news";
import { rankRadar } from "./tech-radar-ranking";
import { eligiblePoliticsArticle } from "./politics-editorial";

// Established outlets with public RSS. Avoid partisan blogs and anonymous channels:
// repeatedly sharing links Facebook fact-checkers rate false reduces a page's reach.
const FEEDS = [
  { name: "BBC عربي", url: "https://feeds.bbci.co.uk/arabic/rss.xml", topic: "سياسة" },
  { name: "فرانس 24", url: "https://www.france24.com/ar/rss", topic: "سياسة" },
  { name: "DW عربية", url: "https://rss.dw.com/xml/rss-ar-all", topic: "سياسة" },
  { name: "الشرق الأوسط", url: "https://aawsat.com/feed", topic: "سياسة" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", topic: "سياسة" },
  { name: "Al Jazeera English", url: "https://www.aljazeera.com/xml/rss/all.xml", topic: "سياسة" },
  { name: "الجزيرة نت", url: "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9", topic: "سياسة" },
  { name: "سكاي نيوز عربية", url: "https://www.skynewsarabia.com/rss.xml", topic: "سياسة" },
  // Yemeni outlet, for closer coverage of Yemen.
  { name: "يمن مونيتور", url: "https://yemenmonitor.com/feed", topic: "اليمن" },
];

export async function readPoliticsFeeds(fetcher:typeof fetch=fetch) {
  return Promise.all(FEEDS.map(async (source) => {
    try {
      const response = await fetcher(source.url, { signal: AbortSignal.timeout(12000), cache: "no-store", headers: { "User-Agent": "NewsReader/1.0" } });
      if (!response.ok) throw new Error("FEED_UNAVAILABLE");
      return { source: source.name, available: true, items: parseFeed(await response.text(), source) };
    } catch {
      return { source: source.name, available: false, items: [] as FeedItem[] };
    }
  }));
}

export const politicsRadarSnapshot = unstable_cache(async () => {
  const feeds = await readPoliticsFeeds();
  const capturedAt = new Date();
  return { capturedAt: capturedAt.toISOString(), feeds: feeds.map(({ source, available, items }) => ({ source, available, count: items.length })), groups: rankRadar(feeds.flatMap((f) => f.items), capturedAt, eligiblePoliticsArticle) };
}, ["politics-radar-v1"], { revalidate: 1800 });

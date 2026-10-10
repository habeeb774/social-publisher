import { unstable_cache } from "next/cache";
import { readTechRadarFeeds } from "./tech-news";
import { rankTechRadar } from "./tech-radar-ranking";

export const techRadarSnapshot = unstable_cache(async () => {
  const feeds = await readTechRadarFeeds();
  const capturedAt = new Date();
  return { capturedAt: capturedAt.toISOString(), feeds: feeds.map(({ source, available, items }) => ({ source, available, count: items.length })), groups: rankTechRadar(feeds.flatMap((f) => f.items), capturedAt) };
}, ["tech-radar-v1"], { revalidate: 1800 });

import { eligibleTechArticle } from "./tech-news-editorial";

export type RadarArticle = { title: string; url: string; source: string; publishedAt: Date };
const stopWords = new Set("the a an to of for in on and with is new how what this that من في على إلى عن مع هذا هذه جديد جديدة التي الذي".split(" "));
function tokens(title: string) {
  return new Set(title.toLowerCase().normalize("NFKC").replace(/[\u064b-\u065f]/g, "").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !stopWords.has(word)));
}
function similar(a: string, b: string) {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const left = tokens(a), right = tokens(b);
  const common = [...left].filter((word) => right.has(word)).length;
  return common >= 3 && common / (left.size + right.size - common) >= 0.5;
}
export function rankTechRadar(items: RadarArticle[], now = new Date()) {
  const groups: { title: string; articles: RadarArticle[]; score: number; sourceCount: number }[] = [];
  const seen = new Set<string>();
  for (const item of [...items].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())) {
    const age = now.getTime() - item.publishedAt.getTime();
    if (!eligibleTechArticle(item) || !Number.isFinite(age) || age < -600000 || age > 48 * 3600000) continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== "https:") continue;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const normalized = { ...item, url: url.href };
    const group = groups.find((g) => similar(g.title, item.title));
    if (group) group.articles.push(normalized);
    else groups.push({ title: item.title, articles: [normalized], score: 0, sourceCount: 0 });
  }
  for (const group of groups) {
    group.sourceCount = new Set(group.articles.map((a) => new URL(a.url).hostname.replace(/^www\./, ""))).size;
    const hours = Math.max(0, (now.getTime() - group.articles[0].publishedAt.getTime()) / 3600000);
    group.score = Math.round(Math.max(0, 60 - hours * 1.25) + Math.min(40, (group.sourceCount - 1) * 20));
  }
  return groups.sort((a, b) => b.score - a.score).slice(0, 30);
}

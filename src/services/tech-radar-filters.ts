export const radarTopics = { ai: "الذكاء الاصطناعي", security: "الأمن والخصوصية", work: "أدوات العمل" };
export function radarTopic(title: string): keyof typeof radarTopics {
  if (/أمن|تسريب|اختراق|خصوصية|\b(?:cybersecurity|security|privacy|data breach|ransomware|hack(?:ed|ing|s)?)\b/i.test(title)) return "security";
  return /ذكاء|\b(?:AI|OpenAI|Anthropic|ChatGPT|Claude|Copilot)\b/i.test(title) ? "ai" : "work";
}
export function radarLanguage(title: string) { return /[\u0621-\u064a]/.test(title) ? "ar" : "en"; }
export type RadarFilters = { q?: string; language?: string; topic?: string; hours?: string; sources?: string; sort?: string };
export function normalizeRadarFilters(f: RadarFilters): RadarFilters {
  return { q: typeof f.q === "string" ? f.q.trim().slice(0,120) : "", language: ["ar","en"].includes(f.language ?? "") ? f.language : "", topic: ["ai","security","work"].includes(f.topic ?? "") ? f.topic : "", hours: ["6","12","24","48"].includes(f.hours ?? "") ? f.hours : "48", sources: f.sources === "multi" ? "multi" : "", sort: ["latest","sources"].includes(f.sort ?? "") ? f.sort : "priority" };
}
type Group = { title: string; score: number; sourceCount: number; articles: { title: string; source: string; publishedAt: Date | string }[] };
export function filterRadarGroups<T extends Group>(groups: T[], input: RadarFilters, now = new Date()): T[] {
  const f = normalizeRadarFilters(input);
  return groups.filter((g) => (!f.sources || g.sourceCount > 1) && g.articles.some((a) => {
    const age = now.getTime() - new Date(a.publishedAt).getTime();
    return Number.isFinite(age) && age >= -600000 && age <= Number(f.hours)*3600000 && (!f.language || radarLanguage(a.title) === f.language) && (!f.topic || radarTopic(a.title) === f.topic) && (!f.q || `${a.title} ${a.source}`.toLowerCase().includes(f.q.toLowerCase()));
  })).sort((a,b) => {
    const recent = new Date(b.articles[0].publishedAt).getTime() - new Date(a.articles[0].publishedAt).getTime();
    return f.sort === "latest" ? recent : f.sort === "sources" ? b.sourceCount-a.sourceCount || recent : b.score-a.score || recent;
  });
}

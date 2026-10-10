import test from "node:test";
import assert from "node:assert/strict";
import { filterRadarGroups, normalizeRadarFilters, radarTopic } from "../src/services/tech-radar-filters";
const now = new Date("2026-10-10T09:00:00Z");
const article = (title: string, hours: number) => ({ title, source: "Source", publishedAt: new Date(now.getTime()-hours*3600000) });
const groups = [
  { title: "ChatGPT update", score: 90, sourceCount: 2, articles: [article("ChatGPT update", 8)] },
  { title: "تحديث أدوات الأتمتة", score: 50, sourceCount: 1, articles: [article("تحديث أدوات الأتمتة", 2)] },
  { title: "AI security breach", score: 60, sourceCount: 3, articles: [article("AI security breach", 4)] },
];
test("filters language, topic, age, search and coverage together", () => {
  assert.equal(filterRadarGroups(groups, { language:"en", topic:"ai", q:"chatgpt", sources:"multi", hours:"12" }, now).length, 1);
  assert.equal(filterRadarGroups(groups, { language:"ar", hours:"6" }, now)[0].title, "تحديث أدوات الأتمتة");
  assert.equal(filterRadarGroups(groups, { q:"absent" }, now).length, 0);
  assert.equal(radarTopic("AI security breach"), "security");
});
test("sorts without mutating source and safely defaults unknown query values", () => {
  assert.equal(filterRadarGroups(groups, { sort:"latest" }, now)[0].title, "تحديث أدوات الأتمتة");
  assert.equal(filterRadarGroups(groups, { sort:"sources" }, now)[0].sourceCount, 3);
  assert.equal(groups[0].score, 90);
  assert.equal(normalizeRadarFilters({ hours:"NaN", language:"xx", sort:"bad" }).hours, "48");
});
test("combined article filters cannot match different articles within the same group", () => {
  const mixed = [{ title:"Mixed", score:80, sourceCount:2, articles:[article("تحديث أدوات العمل", 20), article("ChatGPT update", 1)] }];
  assert.equal(filterRadarGroups(mixed, { language:"ar", hours:"6" }, now).length, 0);
});

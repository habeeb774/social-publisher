import test from "node:test";
import assert from "node:assert/strict";
import { rankTechRadar } from "../src/services/tech-radar-ranking";
const now = new Date("2026-10-10T09:00:00Z");
const article = (title: string, url: string, age = 1) => ({ title, url, source: "Test", publishedAt: new Date(now.getTime() - age * 3600000) });
test("groups similar titles and counts independent hosts rather than feed names", () => {
  const groups = rankTechRadar([
    article("OpenAI launches workflow automation tools", "https://one.test/1"),
    article("OpenAI launches workflow automation tools today", "https://two.test/2"),
    article("OpenAI launches workflow automation tools", "https://one.test/1?utm_source=rss"),
    article("OpenAI launches workflow automation tools", "https://one.test/3"),
  ], now);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].articles.length, 3);
  assert.equal(groups[0].sourceCount, 2);
});
test("rejects promotions, stale/future dates and unsafe URLs; scores stay bounded", () => {
  const groups = rankTechRadar([
    article("AI coupon deals", "https://one.test/1"),
    article("AI software update", "https://one.test/2", 49),
    article("AI software update", "https://one.test/3", -1),
    article("AI software update", "javascript:alert(1)"),
    article("AI software update", "https://one.test/4"),
  ], now);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].articles.length, 1);
  assert.ok(groups[0].score >= 0 && groups[0].score <= 100);
});
test("does not merge unrelated news merely because they mention AI", () => {
  assert.equal(rankTechRadar([article("AI productivity tools for developers", "https://one.test/a"), article("AI cybersecurity ransomware attack reported", "https://two.test/b")], now).length, 2);
});

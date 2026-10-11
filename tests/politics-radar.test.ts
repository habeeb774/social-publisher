import test from "node:test";
import assert from "node:assert/strict";
import { editorialPoliticsPost, eligiblePoliticsArticle, extractPoliticsCard, politicsRisk } from "../src/services/politics-editorial";
import { rankRadar } from "../src/services/tech-radar-ranking";

const a = (title: string) => ({ title, url: "https://example.com/n", source: "BBC عربي" });
test("blocks headlines that risk Facebook enforcement", () => {
  assert.equal(eligiblePoliticsArticle(a("صور مروعة لجثث بعد القصف")), false);
  assert.equal(eligiblePoliticsArticle(a("شائعات عن استقالة الوزير")), false);
  assert.equal(eligiblePoliticsArticle(a("Unverified video shows president")), false);
  assert.equal(eligiblePoliticsArticle(a("وصفة كيك سهلة")), false);
  assert.equal(eligiblePoliticsArticle(a("وزير الخارجية يلتقي نظيره في الرياض")), true);
});
test("marks violent news as sensitive and keeps the draft neutral", () => {
  assert.equal(politicsRisk("مقتل خمسة في غارة"), "sensitive");
  assert.equal(politicsRisk("Trump calls for Ukraine election, says Zelenskyy failed to end war"), "normal");
  assert.equal(eligiblePoliticsArticle(a("«آقورديانو» يتوّج بالكأس الملكي السعودي")), false);
  assert.equal(politicsRisk("قمة خليجية في الدوحة"), "normal");
  const post = editorialPoliticsPost(a("مقتل خمسة في غارة على الحدود"));
  assert.match(post, /دون تبنٍّ لأي موقف/);
  assert.doesNotMatch(post, /شارك|🔥/);
  assert.throws(() => editorialPoliticsPost(a("صور مروعة لجثث")));
});
test("image card reads the headline and source back from the post", () => {
  assert.deepEqual(extractPoliticsCard(editorialPoliticsPost(a("قمة خليجية في الرياض"))), { title: "قمة خليجية في الرياض", source: "BBC عربي" });
});
test("radar ranking uses the supplied eligibility rule", () => {
  const now = new Date("2026-10-10T09:00:00Z");
  const items = [{ ...a("مفاوضات وقف إطلاق النار"), publishedAt: new Date(now.getTime() - 3600000) }, { ...a("ChatGPT update"), url: "https://example.com/x", publishedAt: now }];
  assert.deepEqual(rankRadar(items, now, eligiblePoliticsArticle).map((g) => g.title), ["مفاوضات وقف إطلاق النار"]);
});

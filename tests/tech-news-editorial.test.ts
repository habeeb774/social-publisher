import test from "node:test";
import assert from "node:assert/strict";
import { eligibleTechArticle, editorialTechPost } from "../src/services/tech-news-editorial";
const article = (title: string, url = "https://example.test/news") => ({ title, url, source: "مصدر الاختبار" });
test("automatic news excludes promotions, irrelevant topics and untranslated headlines", () => {
  for (const item of [article("30% Off Canon Promo Codes | October"), article("خصومات على تطبيقات العمل"), article("تحديث تطبيقات العمل", "https://example.test/coupon"), article("سيارة جديدة في السوق"), article("New ChatGPT features")]) {
    assert.equal(eligibleTechArticle(item), false);
    assert.throws(() => editorialTechPost(item), /EDITORIAL_REJECTED/);
  }
});
test("Arabic work-tool news retains its factual headline and source without filler or invented benefits", () => {
  const item = article("مايكروسوفت تطلق تحديثًا لأدوات الإنتاجية");
  const text = editorialTechPost(item);
  assert.match(text, /ما الذي يتغيّر في أدوات عملك/);
  assert.ok(text.includes(item.title) && text.includes(item.url));
  assert.doesNotMatch(text, /ضمن أبرز المستجدات|وفّر|ضاعف/);
  assert.match(editorialTechPost(article("تسريب بيانات في تطبيقات العمل")), /انتبه لهذا الخبر/);
});

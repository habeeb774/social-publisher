import test from "node:test";
import assert from "node:assert/strict";
import { editorialPoliticsPost, eligiblePoliticsArticle, extractPoliticsCard, isYemenNews, politicsRisk } from "../src/services/politics-editorial";
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
test("recognises Yemeni news without matching words that merely contain a city name", () => {
  assert.equal(isYemenNews("الحوثيون يعلنون استهداف سفينة في البحر الأحمر"), true);
  assert.equal(isYemenNews("انقطاع الكهرباء في عدن"), true);
  assert.equal(isYemenNews("Houthis claim new attack"), true);
  assert.equal(isYemenNews("أسعار المعادن ترتفع"), false);
  assert.equal(isYemenNews("إبراهيم يفوز بالبطولة"), false);
  assert.equal(eligiblePoliticsArticle(a("انقطاع الكهرباء في عدن")), true);
  assert.equal(politicsRisk("هجوم الحوثيين على مطار الملك خالد بالرياض يودي بحياة أردني ويصيب 4 آخرين"), "sensitive");
});
test("post leads with a topic emoji and summary, names the source, invites a follow and has no external link", () => {
  const post = editorialPoliticsPost({ ...a("الحوثيون يعلنون استهداف سفينة في البحر الأحمر"), summary: "أعلنت جماعة الحوثي، اليوم الأحد، استهداف سفينة تجارية قرب باب المندب. وأضاف البيان تفاصيل أخرى." });
  assert.match(post, /^🇾🇪 الحوثيون يعلنون/);
  assert.match(post, /أعلنت جماعة الحوثي، اليوم الأحد، استهداف سفينة تجارية قرب باب المندب\./);
  assert.doesNotMatch(post, /وأضاف البيان/);
  assert.match(post, /📌 المصدر: BBC عربي/);
  assert.match(post, /رَصْدُوق/);
  assert.match(post, /#اليمن/);
  assert.doesNotMatch(post, /https?:\/\//);
});
test("summary is dropped when it repeats the headline or contains blocked content, and casualties in it mark the post sensitive", () => {
  assert.doesNotMatch(editorialPoliticsPost({ ...a("قمة خليجية في الرياض"), summary: "قمة خليجية في الرياض اليوم بحضور القادة" }), /اليوم بحضور/);
  assert.doesNotMatch(editorialPoliticsPost({ ...a("وزير الخارجية يزور عدن"), summary: "صور مروعة لجثث في الموقع" }), /مروعة/);
  assert.match(editorialPoliticsPost({ ...a("وزير الخارجية يزور عدن"), summary: "وصل الوزير بعد هجوم أسفر عن مقتل ثلاثة أشخاص." }), /^⚠️[\s\S]*دون تبنٍّ لأي موقف/);
});
test("image card still reads posts written in the old format", () => {
  assert.deepEqual(extractPoliticsCard("📰 قمة خليجية في الرياض\n\nالمصدر: BBC عربي\nالتفاصيل: https://example.com/n\n\n#أخبار"), { title: "قمة خليجية في الرياض", source: "BBC عربي" });
});
test("image card reads the headline and source back from the post", () => {
  assert.deepEqual(extractPoliticsCard(editorialPoliticsPost(a("قمة خليجية في الرياض"))), { title: "قمة خليجية في الرياض", source: "BBC عربي" });
});
test("radar ranking uses the supplied eligibility rule", () => {
  const now = new Date("2026-10-10T09:00:00Z");
  const items = [{ ...a("مفاوضات وقف إطلاق النار"), publishedAt: new Date(now.getTime() - 3600000) }, { ...a("ChatGPT update"), url: "https://example.com/x", publishedAt: now }];
  assert.deepEqual(rankRadar(items, now, eligiblePoliticsArticle).map((g) => g.title), ["مفاوضات وقف إطلاق النار"]);
});

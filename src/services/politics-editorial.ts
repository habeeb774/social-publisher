type Article = { title: string; url: string; source: string };

/**
 * Facebook enforcement risks for political news pages, roughly by severity:
 * graphic violence, praise/representation of designated organisations, hate or
 * sectarian incitement, misinformation/rumours and engagement bait. Headlines
 * matching `blocked` never reach the radar; `sensitive` ones are shown with a
 * warning and drafted in a strictly neutral, attributed format.
 */
const blocked = /أشلاء|جثث|جثة|مقطع مروع|صور مروعة|ذبح|قطع رأس|إعدام ميداني|تمثيل بالجث|بايعوا|مبايعة|شائعة|شائعات|غير مؤكد|لم يتسن التحقق|فيديو مسرب|تسريب صوتي|كفار|روافض|نواصب|صهاينة الخنازير|\b(?:graphic|gore|beheading|beheaded|corpses?|mutilat\w*|unverified|rumou?rs?|leaked video|sponsored|promo codes?)\b/i;
const sensitive = /قتلى|قتيل|شهداء|شهيد|مقتل|جرحى|قصف|غارة|غارات|انفجار|تفجير|هجوم|اشتباكات|حرب|إرهاب|اغتيال|رهائن|أسرى|مجزرة|اعتقال|\b(?:killed|dead|deaths?|casualties|wounded|strikes?|airstrikes?|bomb\w*|explosion|attack\w*|clashes|war|terror\w*|assassinat\w*|hostages?|massacre|arrest\w*)\b/i;
const political = /رئيس|الرئيس|وزير|وزارة|حكومة|الحكومة|برلمان|مجلس|انتخابات|قمة|مفاوضات|اتفاق|اتفاقية|هدنة|وقف إطلاق|عقوبات|سفير|دبلوماسي|الأمم المتحدة|مجلس الأمن|جامعة الدول|الخليج|ولي العهد|الملك|أمير|زيارة رسمية|محادثات|البيت الأبيض|الكرملين|الاتحاد الأوروبي|الناتو|حرب|غارة|قصف|هجوم|اشتباكات|مقتل|\b(?:president|minister|government|parliament|election\w*|summit|talks|negotiat\w*|agreement|deal|ceasefire|truce|sanctions?|ambassador|diplomat\w*|United Nations|UN|Security Council|NATO|EU|White House|Kremlin|Congress|Senate|prime minister|foreign policy|war|strikes?|attack\w*|killed)\b/i;

export type PoliticsRisk = "normal" | "sensitive";

export function eligiblePoliticsArticle(article: Article) {
  const title = article.title.trim();
  return !!title && !blocked.test(`${title} ${article.url}`) && political.test(title);
}
export function politicsRisk(title: string): PoliticsRisk { return sensitive.test(title) ? "sensitive" : "normal"; }

export function extractPoliticsCard(content: string) {
  const lines = content.split("\n").map((line) => line.trim());
  const title = (lines.find((line) => line.startsWith("📰")) ?? "📰 أخبار").replace(/^📰\s*/, "");
  const source = (lines.find((line) => line.startsWith("المصدر:")) ?? "المصدر: أخبار").slice("المصدر:".length).trim();
  return { title: title.length > 180 ? `${title.slice(0, 177).trimEnd()}…` : title, source: source.slice(0, 80) };
}

/** Neutral, attributed text only: no opinion, no emoji hype, no "share if you agree" bait, no source images. */
export function editorialPoliticsPost(article: Article) {
  if (!eligiblePoliticsArticle(article)) throw new Error("POLITICS_EDITORIAL_REJECTED");
  const title = article.title.replace(/\s+/g, " ").trim().slice(0, 220);
  const lines = [`📰 ${title}`, "", `المصدر: ${article.source}`, `التفاصيل: ${article.url}`];
  if (politicsRisk(title) === "sensitive") lines.push("", "ننقل الخبر كما ورد في مصدره دون تبنٍّ لأي موقف.");
  lines.push("", "#أخبار");
  return lines.join("\n");
}

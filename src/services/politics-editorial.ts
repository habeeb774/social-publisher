type Article = { title: string; url: string; source: string };

/**
 * Facebook enforcement risks for political news pages, roughly by severity:
 * graphic violence, praise/representation of designated organisations, hate or
 * sectarian incitement, misinformation/rumours and engagement bait. Headlines
 * matching `blocked` never reach the radar; `sensitive` ones are shown with a
 * warning and drafted in a strictly neutral, attributed format.
 */
const blocked = /أشلاء|جثث|جثة|مقطع مروع|صور مروعة|ذبح|قطع رأس|إعدام ميداني|تمثيل بالجث|بايعوا|مبايعة|شائعة|شائعات|غير مؤكد|لم يتسن التحقق|فيديو مسرب|تسريب صوتي|كفار|روافض|نواصب|صهاينة الخنازير|\b(?:graphic|gore|beheading|beheaded|corpses?|mutilat\w*|unverified|rumou?rs?|leaked video|sponsored|promo codes?)\b/i;
// Only casualty reports are held back from auto-posting; neutral war/politics headlines are allowed.
const sensitive = /قتلى|قتيل|يودي بحياة|أودى بحياة|مصرع|وفاة|ضحايا|يصيب \d|وإصابة|إصابة|شهداء|شهيد|مقتل|جرحى|مصابين|إصابة \d|حصيلة|مجزرة|رهائن|\b(?:killed|dead|deaths?|death toll|casualties|wounded|injured|massacre|hostages?)\b/i;
const political = /رئيس|الرئيس|وزير|وزارة|حكومة|الحكومة|برلمان|مجلس|انتخابات|قمة|مفاوضات|اتفاق|اتفاقية|هدنة|وقف إطلاق|عقوبات|سفير|دبلوماسي|الأمم المتحدة|مجلس الأمن|جامعة الدول|الخليج|ولي العهد|الملك سلمان|خادم الحرمين|أمير|زيارة رسمية|محادثات|البيت الأبيض|الكرملين|الاتحاد الأوروبي|الناتو|حرب|غارة|قصف|هجوم|اشتباكات|مقتل|\b(?:president|minister|government|parliament|election\w*|summit|talks|negotiat\w*|agreement|deal|ceasefire|truce|sanctions?|ambassador|diplomat\w*|United Nations|UN|Security Council|NATO|EU|White House|Kremlin|Congress|Senate|prime minister|foreign policy|war|strikes?|attack\w*|killed)\b/i;

export type PoliticsRisk = "normal" | "sensitive";

export function eligiblePoliticsArticle(article: Article) {
  const title = article.title.trim();
  return !!title && !blocked.test(`${title} ${article.url}`) && (political.test(title) || yemen.test(title));
}
const yemen = /اليمن|يمني|يمنية|اليمنيين|الحوثي|الحوثيين|الحوثيون|أنصار الله|صنعاء|(?<![\u0621-\u064a])(?:عدن|تعز|لحج|أبين|إب|ذمار)(?![\u0621-\u064a])|مأرب|الحديدة|حضرموت|المكلا|شبوة|المهرة|سقطرى|صعدة|الضالع|مجلس القيادة الرئاسي|الانتقالي الجنوبي|باب المندب|البحر الأحمر|\b(?:Yemen\w*|Houthis?|Sanaa|Aden|Marib|Taiz|Hodeidah|Hadramout|Red Sea|Bab el-Mandeb)\b/i;
export function isYemenNews(title: string) { return yemen.test(title); }
export function politicsRisk(title: string): PoliticsRisk { return sensitive.test(title) ? "sensitive" : "normal"; }

export function extractPoliticsCard(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  // The headline is the first line; older posts prefixed it with 📰, newer ones with a topic emoji.
  const title = (lines[0] ?? "أخبار").replace(/^[^\p{L}\p{N}«"(]+/u, "") || "أخبار";
  const sourceLine = lines.find((line) => line.includes("المصدر:"));
  const source = sourceLine ? sourceLine.slice(sourceLine.indexOf("المصدر:") + "المصدر:".length).trim() : "أخبار";
  return { title: title.length > 180 ? `${title.slice(0, 177).trimEnd()}…` : title, source: source.slice(0, 80) };
}

const diplomacy = /قمة|مفاوضات|محادثات|اتفاق|اتفاقية|هدنة|وقف إطلاق|زيارة|يلتقي|لقاء|وساطة|\b(?:summit|talks|deal|agreement|ceasefire|truce|visit|meets?)\b/i;
const economy = /نفط|اقتصاد|أسعار|عملة|الريال|البنك المركزي|عقوبات|ميزانية|\b(?:oil|economy|prices?|sanctions?|currency|budget)\b/i;

/** The opening emoji tells readers at a glance what kind of story it is. */
function opener(text: string) {
  if (politicsRisk(text) === "sensitive") return "⚠️";
  if (yemen.test(text)) return "🇾🇪";
  if (diplomacy.test(text)) return "🤝";
  if (economy.test(text)) return "📊";
  return "🔴";
}

// Varied follow invitations: identical text on every post looks automated. Asking to follow is not
// one of the engagement-bait patterns Facebook demotes (asking for likes, shares, tags or comments is).
const followLines = [
  "تابع رَصْدُوق ليصلك الخبر أولًا بأول.",
  "للمزيد من المستجدات تابع صفحة رَصْدُوق.",
  "رَصْدُوق… أخبار اليمن والمنطقة لحظة بلحظة. تابعنا.",
  "فعّل المتابعة ليصلك كل جديد من رَصْدُوق.",
];

/** First sentence of the feed summary, skipped when it only repeats the headline or is itself unsafe. */
function summarySentence(summary: string | undefined, title: string) {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!text || blocked.test(text)) return "";
  const sentence = (text.match(/^.{40,}?[.!؟?](?=\s|$)/u)?.[0] ?? text).trim();
  const clipped = sentence.length > 240 ? `${sentence.slice(0, 237).trimEnd()}…` : sentence;
  const norm = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, "");
  return norm(clipped).startsWith(norm(title).slice(0, 40)) ? "" : clipped;
}

/**
 * Neutral, attributed text: headline, a one-sentence summary and the source name.
 * No opinion and no like/share/comment bait. The external link is left out because Facebook
 * shows link posts to fewer people; readers can find the story by the outlet's name.
 */
export function editorialPoliticsPost(article: Article & { summary?: string }) {
  if (!eligiblePoliticsArticle(article)) throw new Error("POLITICS_EDITORIAL_REJECTED");
  const title = article.title.replace(/\s+/g, " ").trim().slice(0, 220);
  const summary = summarySentence(article.summary, title);
  const sensitive = politicsRisk(`${title} ${summary}`) === "sensitive";
  const seed = [...article.url].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const lines = [`${opener(`${title} ${summary}`)} ${title}`];
  if (summary) lines.push("", summary);
  lines.push("", `📌 المصدر: ${article.source}`);
  if (sensitive) lines.push("ننقل الخبر كما ورد في مصدره دون تبنٍّ لأي موقف.");
  lines.push("", followLines[seed % followLines.length]);
  lines.push("", ["#رصدوق", "#أخبار", ...(yemen.test(`${title} ${summary}`) ? ["#اليمن"] : [])].join(" "));
  return lines.join("\n");
}

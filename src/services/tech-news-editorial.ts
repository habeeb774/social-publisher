type Article = { title: string; url: string; source: string };

const promotion = /promo[ -]?codes?|coupons?|discounts?|\bdeals?\b|\bsponsored\b|\baffiliate\b|\bbest.{0,30}(?:buy|deals?)\b|كوبون|قسيمة|خصومات?|تخفيضات?|عروض الأسعار|إعلان مدفوع|محتوى ترويجي/i;
const relevant = /أتمتة|الأتمتة|سير العمل|إنتاجية|الإنتاجية|إدارة المهام|أدوات العمل|ذكاء اصطناعي|الذكاء الاصطناعي|نماذج لغوية|أمن سيبراني|الأمن السيبراني|تسريب بيانات|اختراق|برمجيات|تطبيقات|\b(?:ChatGPT|Claude|Copilot|Notion|Zapier|n8n|Microsoft 365|Google Workspace)\b/i;

/** Automatic posts require a source-provided Arabic headline; never invent a translation or claims. */
export function eligibleTechArticle(article: Article) {
  const title = article.title.trim();
  return /[\u0621-\u064a]/.test(title) && !promotion.test(`${title} ${article.url}`) && relevant.test(title);
}

export function editorialTechPost(article: Article) {
  if (!eligibleTechArticle(article)) throw new Error("TECH_NEWS_EDITORIAL_REJECTED");
  const title = article.title.replace(/\s+/g, " ").trim().slice(0, 220);
  const security = /أمن|تسريب|اختراق/.test(title);
  const hook = security ? "🔐 تستخدم هذه الأدوات في عملك؟ انتبه لهذا الخبر." : "⚙️ ما الذي يتغيّر في أدوات عملك؟";
  return [hook, "", title, "", `🔗 التفاصيل من المصدر: ${article.url}`, `المصدر: ${article.source}`, "", security ? "#أمن_المعلومات #أدوات_العمل" : "#الأتمتة #أدوات_العمل #التقنية"].join("\n");
}

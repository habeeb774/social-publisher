type Article = { title: string; url: string; source: string };

const promotion = /promo[ -]?codes?|coupons?|discounts?|\bdeals?\b|\bsponsored\b|\baffiliate\b|\bbest.{0,30}(?:buy|deals?)\b|كوبون|قسيمة|خصومات?|تخفيضات?|عروض الأسعار|إعلان مدفوع|محتوى ترويجي/i;
const relevant = /أتمتة|الأتمتة|سير العمل|إنتاجية|الإنتاجية|إدارة المهام|أدوات العمل|ذكاء اصطناعي|الذكاء الاصطناعي|نماذج لغوية|أمن سيبراني|الأمن السيبراني|تسريب بيانات|اختراق|برمجيات|تطبيقات|تحديث|هواتف|هاتف|آيفون|أندرويد|حواسيب|معالجات?|رقائق|شرائح|أجهزة ذكية|الحوسبة السحابية|السحابة|روبوت|\b(?:ChatGPT|Claude|Copilot|Gemini|Notion|Zapier|n8n|Microsoft 365|Google Workspace)\b|(?:آبل|أبل|جوجل|غوغل|مايكروسوفت|ميتا|سامسونج|سامسونغ|إنفيديا|أمازون|تسلا|أوبن إيه آي|هواوي)/i;

const englishRelevant = /\b(?:AI|artificial intelligence|automation|workflow|productivity|software|cybersecurity|data breach|ransomware|OpenAI|Anthropic|Gemini|ChatGPT|chips?|semiconductors?|smartphones?|iPhone|Android|iOS|Windows|macOS|cloud|robots?|robotics|startups?|Apple|Google|Microsoft|Meta|Samsung|Nvidia|Amazon|Tesla|Huawei)\b/i;

/** Keep the source headline in either language; never invent a translation or claims. */
export function eligibleTechArticle(article: Article) {
  const title = article.title.trim();
  return !!title && !promotion.test(`${title} ${article.url}`) && (relevant.test(title) || englishRelevant.test(title));
}

export function editorialTechPost(article: Article) {
  if (!eligibleTechArticle(article)) throw new Error("TECH_NEWS_EDITORIAL_REJECTED");
  const title = article.title.replace(/\s+/g, " ").trim().slice(0, 220);
  const security = /أمن|تسريب|اختراق|\b(?:cybersecurity|data breach|ransomware|hack(?:ed|ing|s)?)\b/i.test(title);
  const hook = security ? "🔐 تستخدم هذه الأدوات في عملك؟ انتبه لهذا الخبر." : "💡 هل سمعت بهذا الخبر؟";
  return [hook, "", title, "", `🔗 التفاصيل من المصدر: ${article.url}`, `المصدر: ${article.source}`, "", security ? "#أمن_المعلومات #أدوات_العمل" : "#الأتمتة #أدوات_العمل #التقنية"].join("\n");
}

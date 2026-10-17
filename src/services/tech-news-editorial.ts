type Article = { title: string; url: string; source: string;summary?:string };

const promotion = /promo[ -]?codes?|coupons?|discounts?|\bdeals?\b|\bsponsored\b|\baffiliate\b|\bbest.{0,30}(?:buy|deals?)\b|كوبون|قسيمة|خصومات?|تخفيضات?|عروض الأسعار|إعلان مدفوع|محتوى ترويجي/i;
const relevant = /أتمتة|الأتمتة|سير العمل|إنتاجية|الإنتاجية|إدارة المهام|أدوات العمل|ذكاء اصطناعي|الذكاء الاصطناعي|نماذج لغوية|أمن سيبراني|الأمن السيبراني|تسريب بيانات|اختراق|برمجيات|تطبيقات|تحديث|هواتف|هاتف|آيفون|أندرويد|حواسيب|معالجات?|رقائق|شرائح|أجهزة ذكية|الحوسبة السحابية|السحابة|روبوت|\b(?:ChatGPT|Claude|Copilot|Gemini|Notion|Zapier|n8n|Microsoft 365|Google Workspace)\b|(?:آبل|أبل|جوجل|غوغل|مايكروسوفت|ميتا|سامسونج|سامسونغ|إنفيديا|أمازون|تسلا|أوبن إيه آي|هواوي)/i;

const englishRelevant = /\b(?:AI|artificial intelligence|automation|workflow|productivity|software|cybersecurity|data breach|ransomware|OpenAI|Anthropic|Gemini|ChatGPT|chips?|semiconductors?|smartphones?|iPhone|Android|iOS|Windows|macOS|cloud|robots?|robotics|startups?|Apple|Google|Microsoft|Meta|Samsung|Nvidia|Amazon|Tesla|Huawei)\b/i;

/** Keep the source headline in either language; never invent a translation or claims. */
export function eligibleTechArticle(article: Article) {
  const title = article.title.trim();
  return !!title && !promotion.test(`${title} ${article.url}`) && (relevant.test(title) || englishRelevant.test(title));
}

/** Discovery can include English, but automated Arabic pages must not publish
 * untranslated headlines or generic celebrity/roundup stories as AI news. */
export function eligibleAutomaticTechArticle(article:Article,destination:'habeeb'|'former-politics'){
 if(!eligibleTechArticle(article))return false;
 const letters=article.title.match(/\p{L}/gu)??[],arabic=article.title.match(/[\u0621-\u064a]/g)??[];
 if(arabic.length<10||arabic.length/Math.max(1,letters.length)<.55)return false;
 if(/\b(?:celebrity|gym|longevity|roundup|all the news about|live updates)\b|المشاهير|فضائح|كوبونات|ملخص أخبار/i.test(article.title))return false;
 if(destination==='habeeb'&&!/ذكاء|أتمتة|الأتمتة|إنتاجية|الإنتاجية|سير العمل|أدوات العمل|أمن|اختراق|خصوصية|تسريب|برمج|تطبيق|\b(?:AI|GPT|ChatGPT|Claude|Copilot|Gemini|OpenAI|Anthropic|n8n|Zapier|Notion)\b/i.test(article.title))return false;
 return true;
}

export function sourceNewsBrief(article:Article){
 const sentence=(article.summary??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().split(/(?<=[.!؟])\s+/u)[0]??'';
 if(!sentence||sentence.length<35||sentence.length>280||sentence.split(/\s+/).length>25||sentence.includes(article.title)||article.title.includes(sentence))return null;
 const letters=sentence.match(/\p{L}/gu)??[],arabic=sentence.match(/[\u0621-\u064a]/g)??[];
 if(arabic.length<15||arabic.length/Math.max(1,letters.length)<.55||/https?:|@|bearer|ignore|تجاهل|اشترك|اضغط|شارك|تابعنا|system.?prompt/i.test(sentence))return null;
 return sentence;
}
export function editorialTechPost(article: Article,withBrief=false) {
  if (!eligibleTechArticle(article)) throw new Error("TECH_NEWS_EDITORIAL_REJECTED");
  const title = article.title.replace(/\s+/g, " ").trim().slice(0, 220);
  const security = /أمن|تسريب|اختراق|\b(?:cybersecurity|data breach|ransomware|hack(?:ed|ing|s)?)\b/i.test(title);
  const brief=withBrief?sourceNewsBrief(article):null;
  return [title,...(brief?['',`بحسب ${article.source}: «${brief}»`]:[]), "", `🔗 التفاصيل من المصدر: ${article.url}`, `المصدر: ${article.source}`, "", security ? "#أمن_المعلومات" : "#التقنية"].join("\n");
}

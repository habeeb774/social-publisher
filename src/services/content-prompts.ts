/** Reusable, provider-agnostic content prompts. Generation requires a configured AI provider. */
export type ContentFormat = "post" | "image" | "story" | "reel";
export type ContentTopic = "technology" | "general_knowledge" | "tips" | "cybersecurity" | "ai" | "productivity";
export const CONTENT_TOPICS: Record<ContentTopic, string> = {
  technology: "معلومات تقنية", general_knowledge: "معلومات عامة", tips: "نصائح عملية",
  cybersecurity: "الأمن السيبراني", ai: "الذكاء الاصطناعي", productivity: "الإنتاجية",
};
export const CONTENT_FORMATS: readonly ContentFormat[] = ["post", "image", "story", "reel"];
export function buildContentPrompt(topic: ContentTopic, format: ContentFormat, previousTitles: string[] = []) {
  const subject = CONTENT_TOPICS[topic];
  const common = `أنت محرر محتوى عربي محترف. الموضوع: ${subject}. اكتب باللغة العربية الطبيعية، بمعلومة دقيقة قابلة للتحقق دون اختلاق أرقام أو مصادر أو أخبار. امنع السياسة والتحريض والمحتوى المضلل والإعلانات المقنعة. لا تكرر أي عنوان من: ${JSON.stringify(previousTitles.slice(-100))}. إذا تعذر التحقق، ضع verification_status=needs_review ولا توافق على النشر التلقائي.`;
  const instructions: Record<ContentFormat, string> = {
    post: "اكتب عنوانًا جذابًا ومتنًا من 50 إلى 120 كلمة وهاشتاقين مناسبين. لا تستخدم أساليب اصطياد التفاعل.",
    image: "أنشئ وصف صورة فوتوغرافية أو إنفوجرافيك مربعة 1:1 مناسبة للموضوع؛ تفاصيل بصرية دقيقة، بلا شعارات أو أشخاص حقيقيين، ونص قليل قابل للتدقيق.",
    story: "اكتب قصة عمودية 9:16: عنوان قصير، 3 نقاط واضحة، وخاتمة مفيدة، مع وصف بصري مناسب.",
    reel: "اكتب سيناريو ريل عمودي 9:16 من 20 إلى 35 ثانية، مشاهد متتابعة، تعليق صوتي، نصوص ترجمة قصيرة، ووصف لكل لقطة.",
  };
  return `${common}\n${instructions[format]}\nأعد JSON صالحًا فقط يحتوي: topic, format, title, caption, hashtags, visual_prompt, scenes, source_urls, verification_status. لا تخترع روابط المصادر. يجب أن تكون verification_status إما verified أو needs_review.`;
}

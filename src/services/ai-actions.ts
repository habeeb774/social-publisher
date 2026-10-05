/** Client-safe list of AI writing actions (no provider code or secrets). */
export const AI_ACTIONS = {
  improve: { label: "تحسين النص", instruction: "حسّن صياغة النص مع الحفاظ على المعنى واللغة واللهجة." },
  shorten: { label: "اختصار", instruction: "اختصر النص إلى نصف طوله تقريبًا مع الحفاظ على الفكرة الأساسية." },
  formal: { label: "جعله رسميًا", instruction: "أعد كتابة النص بأسلوب رسمي ومهني." },
  marketing: { label: "جعله تسويقيًا", instruction: "أعد كتابة النص بأسلوب تسويقي جذاب دون مبالغة أو ادعاءات غير موجودة في النص." },
  headline: { label: "اقتراح عنوان", instruction: "اقترح عنوانًا قصيرًا واحدًا لهذا المنشور. أعد العنوان فقط." },
  cta: { label: "اقتراح CTA", instruction: "اقترح جملة دعوة لاتخاذ إجراء واحدة مناسبة لهذا المنشور. أعد الجملة فقط." },
} as const;
export type AiAction = keyof typeof AI_ACTIONS;

export type ErrorClass = { key: "connection" | "authorization" | "scheduler" | "image" | "validation" | "database" | "uncertain" | "unknown"; label: string; retryable: boolean; hint: string };

/** Maps raw publisher errors to user-facing categories. Only transient failures are retryable. */
export function classifyError(message: string | null | undefined): ErrorClass {
  const text = message ?? "";
  // An explicit provider rejection (e.g. Facebook #200) means nothing was posted, even when wrapped as "unknown".
  if (/#(190|200|10|102)|permission|pages_manage_posts/i.test(text)) return { key: "authorization", label: "صلاحيات Facebook", retryable: false, hint: "حدّث توكن الصفحة أو صلاحياتها، ثم أعد الجدولة." };
  if (/OUTCOME_UNKNOWN/i.test(text)) return { key: "uncertain", label: "نتيجة غير مؤكدة", retryable: false, hint: "تحقق من صفحة فيسبوك أولًا؛ قد يكون المنشور نُشر فعلًا." };
  if (/#(190|200|10|102)\b|token|permission|oauth|AUTH_REQUIRED|WINDSOR_AUTH/i.test(text)) return { key: "authorization", label: "صلاحيات Facebook", retryable: false, hint: "حدّث توكن الصفحة أو صلاحياتها ثم أعد المحاولة." };
  if (/image|photo|url|MEDIA_UNSUPPORTED|#324|#100/i.test(text)) return { key: "image", label: "مشكلة في الصورة", retryable: true, hint: "تأكد أن رابط الصورة مباشر ومتاح للعموم." };
  if (/timeout|network|fetch failed|ECONN|HTTP 5\d\d|MCP_CONNECTION|#(1|2|4|17|32|613)\b|rate limit/i.test(text)) return { key: "connection", label: "مشكلة اتصال", retryable: true, hint: "خطأ مؤقت غالبًا؛ إعادة المحاولة آمنة." };
  if (/DATABASE|neon|relation|duplicate key/i.test(text)) return { key: "database", label: "قاعدة البيانات", retryable: true, hint: "خطأ في قاعدة البيانات؛ أعد المحاولة بعد قليل." };
  if (/scheduler|worker/i.test(text)) return { key: "scheduler", label: "الجدولة", retryable: true, hint: "تحقق من حالة عامل النشر." };
  if (/invalid|required|empty|validation|غير صالح/i.test(text)) return { key: "validation", label: "بيانات غير صالحة", retryable: false, hint: "عدّل المنشور ثم أعد جدولته." };
  return { key: "unknown", label: "خطأ غير مصنف", retryable: false, hint: "راجع رسالة الخطأ قبل إعادة المحاولة." };
}

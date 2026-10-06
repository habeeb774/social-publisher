/** Small accessible help icon for technical terms (MCP, Safe Mode, Scheduler…). Works on hover, focus and tap. */
export function HelpTip({ text, label = "مساعدة" }: { text: string; label?: string }) {
  return <details className="help-tip"><summary aria-label={label}>ⓘ</summary><span role="tooltip">{text}</span></details>;
}

export const HELP = {
  safeMode: "وضع الاختبار: يمر المنشور بكل خطوات النشر للتأكد أنها تعمل، لكن لا يظهر على صفحتك. أوقفه عندما تكون جاهزًا للنشر الحقيقي.",
  scheduler: "عامل النشر: خدمة تعمل كل 10 دقائق، تبحث عن المنشورات التي حان موعدها وتنشرها.",
  mcp: "Windsor MCP: وسيط يقرأ بيانات صفحتك من Facebook. النشر الفعلي يتم عبر توكن الصفحة.",
  token: "توكن الصفحة: مفتاح سري من Facebook يسمح للنظام بالنشر على صفحتك. لا تشاركه مع أحد.",
  queue: "الطابور: بدل اختيار وقت لكل منشور، حدد أوقاتك الثابتة مرة واحدة ويأخذ كل منشور أول وقت فارغ.",
} as const;

import { SettingsShell } from "../settings-shell";

const EXPORTS: Array<[string, string, string]> = [
  ["posts", "المنشورات (CSV)", "كل المنشورات مع حالتها ومواعيدها وروابطها على Facebook."],
  ["attempts", "محاولات النشر (CSV)", "سجل كل محاولة نشر ونتيجتها."],
  ["activity", "سجل العمليات (CSV)", "من أنشأ وعدّل وجدول وألغى."],
  ["analytics", "التحليلات (CSV)", "الإجماليات وتوزيع النشر حسب اليوم والساعة والصفحة."],
  ["backup", "نسخة احتياطية (JSON)", "المحتوى الأساسي: المنشورات والقوالب والحملات والوسائط والطابور. لا تتضمن أي توكن أو كلمة مرور."],
];
export default function ExportPage() {
  return <SettingsShell active="/settings/export" title="التصدير والنسخ الاحتياطي" description="ملفات CSV تفتح في Excel بالعربية، ونسخة احتياطية JSON بدون أسرار.">
    <div className="card-grid">{EXPORTS.map(([kind, title, desc]) => <article key={kind} className="card"><strong>{title}</strong><p>{desc}</p><a className="btn btn-secondary" href={`/api/export/${kind}`} download>تنزيل</a></article>)}</div>
  </SettingsShell>;
}

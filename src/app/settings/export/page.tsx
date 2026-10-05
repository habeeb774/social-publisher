import { AppShell } from "../../ui/app-shell";

const EXPORTS: Array<[string, string, string]> = [
  ["posts", "المنشورات (CSV)", "كل المنشورات مع حالتها ومواعيدها وروابطها على Facebook."],
  ["attempts", "محاولات النشر (CSV)", "سجل كل محاولة نشر ونتيجتها."],
  ["activity", "سجل العمليات (CSV)", "من أنشأ وعدّل وجدول وألغى."],
  ["analytics", "التحليلات (CSV)", "الإجماليات وتوزيع النشر حسب اليوم والساعة والصفحة."],
  ["backup", "نسخة احتياطية (JSON)", "المحتوى الأساسي: المنشورات والقوالب والحملات والوسائط والطابور. لا تتضمن أي توكن أو كلمة مرور."],
];
export default function ExportPage() {
  return <AppShell title="التصدير والنسخ الاحتياطي">
    <div className="page-intro"><div><h2>التصدير والنسخ الاحتياطي</h2><p>ملفات CSV تفتح في Excel بالعربية مباشرة.</p></div></div>
    <div className="card-grid">{EXPORTS.map(([kind, title, desc]) => <article key={kind} className="panel-card"><strong>{title}</strong><p>{desc}</p><a className="secondary-button" href={`/api/export/${kind}`} download>تنزيل</a></article>)}</div>
  </AppShell>;
}

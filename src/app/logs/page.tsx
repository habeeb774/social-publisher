import { AppShell } from "../ui/app-shell";

export default function LogsPage() {
  return <AppShell title="السجلات" eyebrow="المراقبة">
    <div className="log-filter" role="tablist" aria-label="تصفية السجلات"><button className="active">الكل</button><button>النشر</button><button>Facebook MCP</button><button>Scheduler</button><button>الأخطاء</button></div>
    <div className="log-summary"><div className="panel-card"><span className="stat-label">محاولات اليوم</span><strong>0</strong><small>لا توجد عمليات حتى الآن</small></div><div className="panel-card"><span className="stat-label">حالة العامل</span><strong className="text-green">سليم</strong><small>آخر فحص آمن اكتمل بنجاح</small></div><div className="panel-card"><span className="stat-label">النشر الحقيقي</span><strong className="text-indigo">متوقف</strong><small>Safe Mode مفعّل</small></div></div>
    <section className="panel-card log-card"><div className="section-heading"><div><span className="section-kicker">سجل النشاط</span><h2>Activity logs & Publication attempts</h2><p>تظهر هنا محاولات العامل مع حماية بيانات الاعتماد.</p></div><span className="safe-badge">آمن</span></div><div className="empty-state table-empty"><span>⌁</span><strong>لا توجد سجلات بعد</strong><small>ستظهر الأحداث هنا عند تشغيل الاستيراد أو الجدولة.</small></div></section>
  </AppShell>;
}

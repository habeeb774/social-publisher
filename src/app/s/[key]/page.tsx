import { notFound } from "next/navigation";
import { checkStatusKey, publicStatus } from "@/services/public-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "حالة النظام", robots: { index: false, follow: false } };

const when = (iso: string | null) => iso ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";
function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return <div className="status-row"><span className={`status-dot ${ok === null ? "muted" : ok ? "ok" : "bad"}`}>{ok === null ? "•" : ok ? "✓" : "!"}</span><div><strong>{label}</strong><small>{detail}</small></div></div>;
}

/** Private phone-friendly status page: /s/<key>. Shows operational state only. */
export default async function PublicStatus({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(await checkStatusKey(key))) notFound();
  const s = await publicStatus();
  const allOk = s.publishingEnabled && s.worker.healthy && s.posts.failed24h === 0;
  return <main className="public-status">
    <style>{`
      .public-status{max-width:520px;margin:0 auto;padding:24px 16px;font-family:var(--font);color:var(--text)}
      .public-status h1{font-size:22px;margin:0 0 4px}.public-status .hero{padding:16px;border-radius:14px;margin:16px 0;background:${allOk ? "var(--success-soft)" : "var(--warning-soft)"};color:${allOk ? "var(--success)" : "var(--warning)"};font-weight:700}
      .status-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border)}.status-row strong{display:block;color:var(--heading)}.status-row small{color:var(--muted)}
      .status-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;font-weight:700}.status-dot.ok{background:var(--success-soft);color:var(--success)}.status-dot.bad{background:var(--danger-soft);color:var(--danger)}.status-dot.muted{background:var(--subtle);color:var(--muted)}
    `}</style>
    <h1>حالة نظام النشر</h1><small className="muted">آخر تحديث: {when(s.generatedAt)} · حدّث الصفحة للمتابعة</small>
    <div className="hero">{allOk ? "✓ كل شيء يعمل" : "! يوجد ما يحتاج انتباهك"}</div>
    <Row ok={s.publishingEnabled} label="النشر الحقيقي" detail={s.publishingEnabled ? "مفعّل" : "متوقف (وضع الاختبار)"} />
    <Row ok={s.worker.healthy} label="عامل النشر" detail={s.worker.lastRun ? `آخر تشغيل ${when(s.worker.lastRun)} (قبل ${s.worker.minutesSince} دقيقة)` : "لم يعمل بعد"} />
    <Row ok={s.posts.scheduled > 0} label="المنشورات المجدولة" detail={`${s.posts.scheduled} مجدول · القادم: ${when(s.posts.nextPost)}`} />
    <Row ok={s.posts.failed24h === 0} label="آخر 24 ساعة" detail={`نُشر ${s.posts.published24h} · فشل ${s.posts.failed24h}`} />
    <Row ok={s.comments.lastSync ? s.comments.ok : null} label="مزامنة التعليقات" detail={s.comments.lastSync ? `آخر مزامنة ${when(s.comments.lastSync)}` : "لم تبدأ"} />
    <Row ok={s.messenger ? s.messenger.ok : null} label="رسائل ماسنجر" detail={s.messenger ? (s.messenger.ok ? "تعمل" : "تحتاج إذن pages_messaging أو رمزًا محدثًا") : "لم تبدأ"} />
    {s.alerts.length > 0 && <><h2 style={{ fontSize: 16, marginTop: 20 }}>آخر التنبيهات</h2>{s.alerts.map((a, i) => <Row key={i} ok={false} label={a.title} detail={when(a.at)} />)}</>}
  </main>;
}

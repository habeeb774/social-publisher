export default function LogsPage() {
  return (
    <main className="shell">
      <h1>السجلات</h1>
      <section className="card">
        <h2>Activity logs وPublication attempts</h2>
        <p className="muted">يتم تسجيل محاولات النشر في Neon عبر publication_attempts، مع إبقاء بيانات الاعتماد خارج السجلات.</p>
        <div className="banner">Safe Mode مفعّل — لا توجد منشورات Facebook حقيقية قيد التنفيذ.</div>
      </section>
    </main>
  );
}

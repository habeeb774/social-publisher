export default function Loading() {
  return <main className="app-content" aria-busy="true" aria-label="جارٍ تحميل الصفحة">
    <div className="stack">
      <div className="skeleton skeleton-title" style={{ width: 220 }} />
      <div className="skeleton" style={{ height: 88, borderRadius: 12 }} />
      <div className="split"><div className="skeleton skeleton-block" /><div className="skeleton skeleton-block" /></div>
      <div className="skeleton" style={{ height: 260, borderRadius: 12 }} />
    </div>
  </main>;
}

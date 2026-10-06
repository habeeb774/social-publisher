"use client";
import { useEffect, useState } from "react";
import { toast } from "../../ui/feedback";

export function StatusLink() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { fetch("/api/settings/status-link").then((r) => r.ok ? r.json() : null).then((d) => d && setUrl(d.url)).catch(() => {}); }, []);
  if (!url) return null;
  return <section className="card" style={{ marginTop: 16 }}>
    <h2>صفحة الحالة للجوال</h2>
    <p className="muted">رابط خاص يعرض حالة النشر والتنبيهات بدون تسجيل دخول. لا يعرض أي محتوى أو رموز. احفظه في الشاشة الرئيسية لجوالك ولا تشاركه.</p>
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">فتح الصفحة</a>
      <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("نُسخ الرابط"))}>نسخ الرابط</button>
      <button className="btn btn-ghost" onClick={async () => { const r = await fetch("/api/settings/status-link", { method: "POST" }); const d = await r.json().catch(() => null); if (d?.url) { setUrl(d.url); toast("أُنشئ رابط جديد وأُلغي القديم"); } }}>إنشاء رابط جديد</button>
    </div>
  </section>;
}

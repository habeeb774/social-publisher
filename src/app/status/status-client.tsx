"use client";
import { useState } from "react";
import { api } from "../ui/api";

type Check = { key: string; label: string; state: "healthy" | "warning" | "error" | "off"; detail: string };
const LABEL = { healthy: "سليم", warning: "تنبيه", error: "مشكلة", off: "غير مُعد" };
const HELP: Record<string, string> = {
  scheduler: "عامل النشر هو ما يرسل المنشورات في موعدها. يشتغل كل 10 دقائق عبر cron-job.org.",
  facebook: "التوكن هو مفتاح الدخول الذي يسمح للنظام بالنشر على صفحتك.",
  windsor: "Windsor MCP وسيط لقراءة بيانات فيسبوك. النشر نفسه يتم عبر التوكن مباشرة.",
  storage: "التخزين يحفظ الصور التي ترفعها من جهازك.",
};

export function StatusClient({ initial }: { initial: { checks: Check[]; publishingEnabled: boolean } }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  async function diagnose() {
    setBusy(true);
    try { setData(await api("/api/diagnostics", { method: "POST" })); setRanAt(new Date().toLocaleTimeString("ar-SA")); } finally { setBusy(false); }
  }
  return <>
    <div className="page-intro"><div><h2>حالة النظام</h2><p>{data.publishingEnabled ? "النشر الحقيقي مفعّل." : "وضع الاختبار: لا يُنشر شيء فعليًا."} التشخيص يقرأ فقط ولا ينشر أي شيء.</p></div><button className="btn btn-primary" disabled={busy} onClick={diagnose}>{busy ? "جارٍ التشخيص…" : "تشخيص النظام"}</button></div>
    {ranAt && <p className="banner" role="status">آخر تشخيص: {ranAt}</p>}
    <div className="card-grid">{data.checks.map((c) => <article key={c.key} className={`panel-card status-card state-${c.state}`}><header><strong>{c.label}</strong><span className={`status-pill state-${c.state}`}>{LABEL[c.state]}</span></header><p>{c.detail}</p>{HELP[c.key] && <small title={HELP[c.key]}>ⓘ {HELP[c.key]}</small>}</article>)}</div>
  </>;
}

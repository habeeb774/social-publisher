"use client";
import { useState } from "react";
import { toast } from "../../ui/feedback";

export function TestEmailButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function send() {
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/notifications/test", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      const msg = d.ok ? `أُرسلت رسالة تجريبية إلى ${d.to}. تحقق من البريد (وفي مجلد الرسائل غير المرغوبة).` : `لم تُرسل: ${d.error ?? "خطأ غير معروف"}`;
      setResult(msg); toast(msg, d.ok ? undefined : "error");
    } finally { setBusy(false); }
  }
  return <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
    <button className="btn btn-secondary" disabled={busy} onClick={send}>{busy ? "جارٍ الإرسال…" : "إرسال بريد تجريبي"}</button>
    {result && <small className="muted">{result}</small>}
  </div>;
}

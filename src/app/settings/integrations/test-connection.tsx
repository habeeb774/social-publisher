"use client";
import { useState } from "react";
import { api } from "../../ui/api";
import { toast } from "../../ui/feedback";
import { Icon } from "../../ui/icons";

type Check = { key: string; label: string; state: string; detail: string };
/** Runs the non-destructive diagnostics (no publishing) and shows each result inline. */
export function TestConnectionButton() {
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  async function test() {
    setBusy(true);
    try { const r = await api<{ checks: Check[] }>("/api/diagnostics", { method: "POST" }); setChecks(r.checks); toast(r.checks.some((c) => c.state === "error") ? "اكتمل الاختبار مع مشاكل" : "كل الاختبارات سليمة", r.checks.some((c) => c.state === "error") ? "warning" : "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر الاختبار", "error"); } finally { setBusy(false); }
  }
  return <div className="stack" style={{ gap: 8 }}>
    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={test}><Icon name="status" width={14} />{busy ? "جارٍ الاختبار…" : "اختبار كل التكاملات"}</button>
    {checks && <ul className="checklist">{checks.map((c) => <li key={c.key} className={c.state === "healthy" ? "ok" : c.state === "error" ? "bad" : "warn"}>{c.state === "healthy" ? "✓" : c.state === "error" ? "✕" : "!"} {c.label}<small> · {c.detail}</small></li>)}</ul>}
  </div>;
}

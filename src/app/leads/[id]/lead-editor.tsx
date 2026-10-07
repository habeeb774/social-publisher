"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_LABELS, LEAD_STAGES } from "@/services/leads-stages";

export type LeadEditorData = { id: string; name: string; contact: string | null; status: string; notes: string | null; updatedAt: string };
export function LeadEditor({ lead, editable }: { lead: LeadEditorData; editable: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(lead);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.name, contact: form.contact || null, status: form.status, notes: form.notes || null, expectedUpdatedAt: form.updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر الحفظ");
      setForm(current => ({ ...current, updatedAt: result.updated_at }));
      setFailed(false); setMessage("تم حفظ بيانات العميل"); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setBusy(false); }
  }
  return <form className="card stack" onSubmit={save} style={{ gap: 16 }}>
    {!editable && <div className="alert alert-info">عرض فقط؛ لا تملك صلاحية تعديل العميل.</div>}
    <label>اسم العميل<input value={form.name} maxLength={160} required disabled={!editable || busy} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label>معلومات التواصل<input value={form.contact ?? ""} maxLength={500} disabled={!editable || busy} onChange={e => setForm({ ...form, contact: e.target.value })} /></label>
    <label>مرحلة العميل<select value={form.status} disabled={!editable || busy} onChange={e => setForm({ ...form, status: e.target.value })}>{LEAD_STAGES.map(stage => <option key={stage} value={stage}>{LEAD_LABELS[stage]}</option>)}</select></label>
    <label>ملاحظات داخلية<textarea value={form.notes ?? ""} maxLength={10000} rows={5} disabled={!editable || busy} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
    {message && <div className={`alert ${failed ? "alert-warning" : "alert-success"}`} role={failed ? "alert" : "status"}>{message}{failed && <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>إعادة تحميل</button>}</div>}
    {editable && <button className="btn btn-primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ بيانات العميل"}</button>}
  </form>;
}

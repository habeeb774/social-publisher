"use client";
import { useState } from "react";
import type { GeneralSettings } from "@/services/general-settings";
import { api } from "../ui/api";
import { toast } from "../ui/feedback";

export function GeneralForm({ initial, pages, canEdit }: { initial: GeneralSettings; pages: Array<{ id: string; name: string }>; canEdit: boolean }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api("/api/settings/general", { method: "PUT", body: form }); toast("حُفظت الإعدادات"); } catch (e) { toast(e instanceof Error ? e.message : "تعذر الحفظ", "error"); } finally { setBusy(false); }
  }
  return <section className="card">
    <fieldset disabled={!canEdit || busy} className="list">
      <div className="setting-row"><div><strong>اسم النظام</strong><small>يظهر في الإشعارات والبريد.</small></div><input style={{ maxWidth: 280 }} value={form.systemName} onChange={(e) => setForm({ ...form, systemName: e.target.value })} aria-label="اسم النظام" /></div>
      <div className="setting-row"><div><strong>المنطقة الزمنية</strong><small>كل المواعيد تُعرض بتوقيت الرياض وتُحفظ بتوقيت UTC.</small></div><span className="badge badge-neutral">Asia/Riyadh · UTC+3</span></div>
      <div className="setting-row"><div><strong>الصفحة الافتراضية</strong><small>تُختار تلقائيًا عند إنشاء منشور جديد.</small></div><select style={{ maxWidth: 280 }} value={form.defaultPageId ?? ""} onChange={(e) => setForm({ ...form, defaultPageId: e.target.value || null })} aria-label="الصفحة الافتراضية"><option value="">أول صفحة متصلة</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="setting-row"><div><strong>وقت النشر الافتراضي</strong><small>يُقترح في المحرر وعند الاستيراد بدون وقت.</small></div><input type="time" style={{ maxWidth: 160 }} value={form.defaultPublishTime} onChange={(e) => setForm({ ...form, defaultPublishTime: e.target.value })} aria-label="وقت النشر الافتراضي" /></div>
    </fieldset>
    {canEdit ? <div className="form-actions"><button className="btn btn-primary" disabled={busy} onClick={save}>حفظ</button></div> : <small>تعديل الإعدادات متاح للمدير فقط.</small>}
  </section>;
}

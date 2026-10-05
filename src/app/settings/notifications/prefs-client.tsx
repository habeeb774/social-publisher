"use client";
import { useState } from "react";
import { api } from "../../ui/api";

type Pref = { inApp: boolean; email: boolean };
export function PrefsClient({ types, initial, emailConfigured, approvalRequired }: { types: Array<{ key: string; label: string; defaults: Pref }>; initial: Record<string, Pref>; emailConfigured: boolean; approvalRequired: boolean }) {
  const [prefs, setPrefs] = useState<Record<string, Pref>>(Object.fromEntries(types.map((t) => [t.key, { ...t.defaults, ...initial[t.key] }])));
  const [approval, setApproval] = useState(approvalRequired);
  const [message, setMessage] = useState("");
  const set = (key: string, field: keyof Pref, value: boolean) => setPrefs({ ...prefs, [key]: { ...prefs[key], [field]: value } });
  async function save() {
    try { await api("/api/settings/notifications", { method: "PUT", body: prefs }); await api("/api/settings/approval", { method: "PUT", body: { required: approval } }); setMessage("تم الحفظ"); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر الحفظ"); }
  }
  return <section className="panel-card">
    <h2>الإشعارات</h2>{!emailConfigured && <p className="banner">البريد غير مفعّل بعد: أضف RESEND_API_KEY في Vercel لتصلك الرسائل. خيارات البريد محفوظة وتعمل فور التفعيل.</p>}
    <div className="responsive-table"><table className="data-table"><thead><tr><th>الحدث</th><th>داخل النظام</th><th>بالبريد</th></tr></thead><tbody>{types.map((t) => <tr key={t.key}><td>{t.label}</td><td><input type="checkbox" aria-label={`${t.label} داخل النظام`} checked={prefs[t.key].inApp} onChange={(e) => set(t.key, "inApp", e.target.checked)} /></td><td><input type="checkbox" aria-label={`${t.label} بالبريد`} checked={prefs[t.key].email} onChange={(e) => set(t.key, "email", e.target.checked)} /></td></tr>)}</tbody></table></div>
    <h2>سير العمل</h2>
    <label className="toggle-row"><input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} /> طلب موافقة قبل الجدولة <small>(عند التفعيل: «جدولة» ترسل المنشور للمراجعة، ولا يُجدول إلا بعد الموافقة. المنشورات المجدولة حاليًا لا تتأثر.)</small></label>
    <button className="primary-button" onClick={save}>حفظ الإعدادات</button>{message && <p role="status">{message}</p>}
  </section>;
}

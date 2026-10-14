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
      <div className="setting-row"><div><strong>الأخبار السياسية</strong><small>تحكم مركزي في جدولة الأخبار السياسية على كل الصفحات المرتبطة بالنظام.</small></div><label className="switch"><input type="checkbox" checked={form.politicsNewsEnabled} onChange={(e) => setForm({ ...form, politicsNewsEnabled: e.target.checked })} aria-label="تفعيل الأخبار السياسية" /><span /></label></div>
      <div className="setting-row"><div><strong>الأخبار التقنية</strong><small>تحكم مركزي في جدولة الأخبار التقنية على كل الصفحات المرتبطة بالنظام.</small></div><label className="switch"><input type="checkbox" checked={form.technologyNewsEnabled} onChange={(e) => setForm({ ...form, technologyNewsEnabled: e.target.checked })} aria-label="تفعيل الأخبار التقنية" /><span /></label></div>
      <div className="setting-row"><div><strong>النظام بالكامل</strong><small>مفتاح طوارئ يوقف العامل الآلي وجميع العمليات الخلفية.</small></div><label className="switch"><input type="checkbox" checked={form.systemEnabled} onChange={(e) => setForm({ ...form, systemEnabled: e.target.checked })} aria-label="تفعيل النظام" /><span /></label></div>
      {([['automationEnabled','التشغيل الآلي','المهام المجدولة والخلفية'],['publishingEnabled','النشر','إرسال المنشورات المجدولة'],['commentsEnabled','التعليقات والردود','مزامنة التعليقات والردود الآلية'],['messengerEnabled','Messenger والعملاء','المزامنة والمتابعة الآلية'],['contentEnabled','المحتوى','المحتوى النصي والمعلومات'],['videoEnabled','الفيديو والريلز','معالجة ونشر الفيديو'],['integrationsEnabled','التكاملات','الاتصالات الخارجية والمزامنة']] as const).map(([key,label,help]) => <div className="setting-row" key={key}><div><strong>{label}</strong><small>{help}.</small></div><label className="switch"><input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} aria-label={`تفعيل ${label}`} /><span /></label></div>)}
    </fieldset>
    {canEdit ? <div className="form-actions"><button className="btn btn-primary" disabled={busy} onClick={save}>حفظ</button></div> : <small>تعديل الإعدادات متاح للمدير فقط.</small>}
  </section>;
}

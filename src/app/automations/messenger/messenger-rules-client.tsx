"use client";

import { useEffect, useState } from "react";
import { confirmDialog, toast } from "../../ui/feedback";

type Rule = {
  id: string;
  name: string;
  active: boolean;
  operator: "contains" | "equals" | "starts_with" | "any";
  keywords: string[];
  replyText: string;
  pageIds: string[];
  requireApproval: boolean;
  priority: number;
};
type Catalog = { pages: Array<{ id: string; name: string; accountId: string | null; accountName: string | null }> };
type Payload = { enabled: boolean; rules: Rule[]; catalog: Catalog };
const blank = (): Omit<Rule, "id"> => ({
  name: "",
  active: true,
  operator: "contains",
  keywords: [],
  replyText: "",
  pageIds: [],
  requireApproval: true,
  priority: 100,
});

async function api<T>(body?: unknown): Promise<T> {
  const response = await fetch("/api/messages/automation", body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  } : { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "تعذر التنفيذ");
  return data as T;
}

export function MessengerRulesClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);

  const load = async () => setData(await api<Payload>());
  useEffect(() => { void load().catch((e) => toast(e instanceof Error ? e.message : "تعذر تحميل الأتمتة", "error")); }, []);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await api({ action: "toggle", enabled });
      setData((current) => current ? { ...current, enabled } : current);
      toast(enabled ? "تم تشغيل أتمتة Messenger" : "تم إيقاف أتمتة Messenger");
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر التحديث", "error");
    } finally { setBusy(false); }
  }

  function edit(rule: Rule) {
    setEditing(rule.id);
    setForm({
      name: rule.name,
      active: rule.active,
      operator: rule.operator,
      keywords: [...rule.keywords],
      replyText: rule.replyText,
      pageIds: [...rule.pageIds],
      requireApproval: rule.requireApproval,
      priority: rule.priority,
    });
  }

  async function save() {
    setBusy(true);
    try {
      const saved = await api<Rule>({
        action: "save",
        ...(editing ? { id: editing } : {}),
        input: form,
      });
      toast(editing ? "تم تحديث القاعدة" : "تمت إضافة القاعدة");
      setEditing(null);
      setForm(blank());
      setData((current) => current ? {
        ...current,
        rules: [...current.rules.filter((rule) => rule.id !== saved.id), saved].sort((a, b) => a.priority - b.priority),
      } : current);
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر حفظ القاعدة", "error");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!await confirmDialog({ title: "حذف قاعدة Messenger؟", message: "لن يتم تطبيقها على الرسائل الجديدة بعد الحذف.", danger: true, confirmLabel: "حذف" })) return;
    setBusy(true);
    try {
      await api({ action: "delete", id });
      setData((current) => current ? { ...current, rules: current.rules.filter((rule) => rule.id !== id) } : current);
      if (editing === id) { setEditing(null); setForm(blank()); }
      toast("تم حذف القاعدة");
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر الحذف", "error");
    } finally { setBusy(false); }
  }

  if (!data) return <div className="card"><p>جارٍ تحميل إعدادات Messenger…</p></div>;

  return <div className="stack" style={{ gap: 16 }}>
    <section className="card">
      <div className="card-header">
        <div><h2>التشغيل العام</h2><small>الأتمتة لا ترسل أي رد ما لم تكن مفعّلة وتوجد قاعدة مطابقة.</small></div>
        <label className="switch"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} /><span /></label>
      </div>
      <div className={"alert " + (data.enabled ? "alert-success" : "alert-info")}>
        <span><b>{data.enabled ? "الأتمتة مفعّلة" : "الأتمتة متوقفة"}</b> · القواعد التي تتطلب موافقة بشرية لا ترسل تلقائيًا.</span>
      </div>
    </section>

    <section className="card">
      <div className="card-header"><div><h2>{editing ? "تعديل قاعدة" : "قاعدة جديدة"}</h2><small>الافتراضي آمن: موافقة بشرية قبل الإرسال.</small></div>{editing && <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setForm(blank()); }}>إلغاء التعديل</button>}</div>
      <div className="field-row">
        <label>اسم القاعدة<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: استفسار السعر" /></label>
        <label>الأولوية<input type="number" min={1} max={999} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 100 })} /></label>
      </div>
      <div className="field-row">
        <label>المطابقة<select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value as Rule["operator"] })}><option value="contains">يحتوي</option><option value="equals">يساوي</option><option value="starts_with">يبدأ بـ</option><option value="any">أي رسالة</option></select></label>
        <label>الكلمات المفتاحية<input disabled={form.operator === "any"} value={form.keywords.join("، ")} onChange={(e) => setForm({ ...form, keywords: e.target.value.split(/[،,\n]+/).map((x) => x.trim()).filter(Boolean) })} placeholder="سعر، كم السعر، بكم" /></label>
      </div>
      <label>نص الرد<textarea value={form.replyText} onChange={(e) => setForm({ ...form, replyText: e.target.value })} placeholder="اكتب الرد المقترح أو التلقائي…" /></label>
      {data.catalog.pages.length > 0 && <div className="stack" style={{ gap: 8 }}>
        <strong>الصفحات</strong><small>اتركها بدون تحديد لتطبيق القاعدة على جميع صفحات Facebook المتصلة.</small>
        <div className="chips">{data.catalog.pages.map((page) => <label className="chip" key={page.id}><input type="checkbox" checked={form.pageIds.includes(page.id)} onChange={() => setForm({ ...form, pageIds: form.pageIds.includes(page.id) ? form.pageIds.filter((id) => id !== page.id) : [...form.pageIds, page.id] })} />{page.name}{page.accountName ? " · " + page.accountName : ""}</label>)}</div>
      </div>}
      <label className="setting-row"><div><strong>موافقة بشرية قبل الرد</strong><small>عند إلغائها يرسل النظام الرد تلقائيًا عبر Messenger عند تطابق الرسالة.</small></div><input type="checkbox" checked={form.requireApproval} onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })} /></label>
      <label className="setting-row"><div><strong>القاعدة نشطة</strong></div><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></label>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy || !form.name.trim() || !form.replyText.trim() || (form.operator !== "any" && !form.keywords.length)} onClick={save}>{busy ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إضافة القاعدة"}</button></div>
    </section>

    <section className="card card-flush">
      <div className="card-header" style={{ padding: "16px 20px 0" }}><h2>قواعد Messenger</h2><small>{data.rules.length}</small></div>
      {!data.rules.length ? <div className="empty-state"><strong>لا توجد قواعد بعد</strong><small>لن يُرسل أي رد تلقائي حتى تنشئ قاعدة وتفعّل الأتمتة.</small></div> :
      <div className="responsive-table"><table className="data-table"><thead><tr><th>القاعدة</th><th>المطابقة</th><th>الصفحات</th><th>الإرسال</th><th>الحالة</th><th /></tr></thead><tbody>{data.rules.map((rule) => <tr key={rule.id}>
        <td><b>{rule.name}</b><span className="cell-meta clamp-2">{rule.replyText}</span></td>
        <td>{rule.operator === "any" ? "أي رسالة" : rule.keywords.join("، ")}</td>
        <td>{rule.pageIds.length ? rule.pageIds.length + " صفحة" : "كل الصفحات"}</td>
        <td><span className={"badge " + (rule.requireApproval ? "badge-warning" : "badge-success")}>{rule.requireApproval ? "بعد موافقة" : "تلقائي"}</span></td>
        <td><span className={"badge " + (rule.active ? "badge-success" : "badge-neutral")}>{rule.active ? "نشطة" : "متوقفة"}</span></td>
        <td><div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => edit(rule)}>تعديل</button><button className="btn btn-ghost btn-sm danger" onClick={() => void remove(rule.id)}>حذف</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>

    <div className="alert alert-info"><span><b>حماية تلقائية:</b> الرسائل المتعلقة بالشكاوى، الدفع، الاسترجاع أو الاحتيال لا تحصل على رد تلقائي، ويوجد منع تكرار للرد الآلي على نفس المحادثة لمدة 6 ساعات.</span></div>
  </div>;
}

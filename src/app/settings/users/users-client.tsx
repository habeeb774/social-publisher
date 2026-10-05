"use client";
import { FormEvent, useState } from "react";
import { api, riyadh } from "../../ui/api";
import { confirmDialog, toast } from "../../ui/feedback";

type User = { id: string; email: string; name: string | null; role: string; isActive: boolean; lastLoginAt: string | null };
const ROLES: Record<string, string> = { admin: "مدير", editor: "محرر", reviewer: "مراجع", viewer: "مشاهد" };

export function UsersClient({ initial }: { initial: User[] }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState({ name: "", email: "", role: "editor", password: "" });
  const [busy, setBusy] = useState(false);
  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const u = await api<User>("/api/users", { method: "POST", body: form }); setRows([...rows, u]); setForm({ name: "", email: "", role: "editor", password: "" }); toast("أُضيف العضو. شارك معه كلمة المرور بطريقة آمنة."); } catch (err) { toast(err instanceof Error ? err.message : "تعذرت الإضافة", "error"); } finally { setBusy(false); }
  }
  async function patch(u: User, change: Partial<User> & { password?: string }, msg: string) {
    try { const next = await api<User>("/api/users", { method: "PATCH", body: { id: u.id, ...change } }); setRows(rows.map((r) => r.id === u.id ? next : r)); toast(msg); } catch (err) { toast(err instanceof Error ? err.message : "تعذر التعديل", "error"); }
  }
  return <>
    <section className="card card-flush"><div className="card-header" style={{ padding: "16px 20px 0" }}><h2>أعضاء الفريق</h2><small>{rows.length}</small></div>
      {!rows.length ? <div className="empty-state"><strong>لا يوجد أعضاء بعد</strong><small>أضف أول عضو من النموذج أدناه.</small></div> :
      <div className="responsive-table"><table className="data-table"><thead><tr><th>العضو</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th><span className="sr-only">إجراءات</span></th></tr></thead><tbody>{rows.map((u) => <tr key={u.id}>
        <td data-label="العضو"><b style={{ color: "var(--heading)", fontWeight: 500 }}>{u.name ?? u.email}</b><span className="cell-meta" dir="ltr" style={{ textAlign: "right" }}>{u.email}</span></td>
        <td data-label="الدور"><select aria-label="الدور" value={u.role} onChange={(e) => patch(u, { role: e.target.value }, "تم تغيير الدور (يسري عند الدخول القادم)")} style={{ width: "auto" }}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
        <td data-label="الحالة"><span className={`badge ${u.isActive ? "badge-success" : "badge-neutral"}`}>{u.isActive ? "نشط" : "معطل"}</span></td>
        <td data-label="آخر دخول" className="num">{riyadh(u.lastLoginAt)}</td>
        <td><div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={async () => { const pw = prompt("كلمة مرور جديدة (10 أحرف على الأقل)"); if (pw) patch(u, { password: pw }, "تم تغيير كلمة المرور"); }}>كلمة المرور</button><button className={`btn btn-ghost btn-sm ${u.isActive ? "danger" : ""}`} onClick={async () => { if (!u.isActive || await confirmDialog({ title: `تعطيل ${u.name ?? u.email}؟`, message: "يفقد الوصول فورًا.", danger: true, confirmLabel: "تعطيل" })) patch(u, { isActive: !u.isActive }, u.isActive ? "عُطل الحساب" : "فُعّل الحساب"); }}>{u.isActive ? "تعطيل" : "تفعيل"}</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>
    <form className="card" onSubmit={add}><div className="card-header"><h2>إضافة عضو</h2></div>
      <div className="field-row"><label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>البريد<input required type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label></div>
      <div className="field-row"><label>الدور<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label><label>كلمة مرور مبدئية<input required type="password" dir="ltr" minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small>10 أحرف على الأقل. تُحفظ مشفرة (scrypt).</small></label></div>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy}>إضافة العضو</button></div>
    </form>
  </>;
}

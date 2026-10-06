"use client";
import { FormEvent, useMemo, useState } from "react";
import { api, riyadh } from "../../ui/api";
import { confirmDialog, toast } from "../../ui/feedback";

type Scope = { unrestricted: boolean; accountIds: string[]; pageIds: string[] };
type User = { id: string; email: string; name: string | null; role: string; isActive: boolean; lastLoginAt: string | null; scope: Scope };
type Account = { id: string; name: string };
type Page = { id: string; name: string; platform: string };
const ROLES: Record<string, string> = { admin: "مدير", editor: "محرر", reviewer: "مراجع", viewer: "مشاهد" };
const emptyScope = (): Scope => ({ unrestricted: true, accountIds: [], pageIds: [] });

export function UsersClient({ initial, accounts, pages }: { initial: User[]; accounts: Account[]; pages: Page[] }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState({ name: "", email: "", role: "editor", password: "" });
  const [busy, setBusy] = useState(false);
  const [scopeUserId, setScopeUserId] = useState<string | null>(null);
  const scopeUser = useMemo(() => rows.find((u) => u.id === scopeUserId) ?? null, [rows, scopeUserId]);
  const [scopeDraft, setScopeDraft] = useState<Scope>(emptyScope());

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const u = await api<User>("/api/users", { method: "POST", body: form });
      setRows([...rows, { ...u, scope: u.scope ?? emptyScope() }]);
      setForm({ name: "", email: "", role: "editor", password: "" });
      toast("أُضيف العضو. شارك معه كلمة المرور بطريقة آمنة.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذرت الإضافة", "error");
    } finally {
      setBusy(false);
    }
  }

  async function patch(u: User, change: Partial<User> & { password?: string }, msg: string) {
    try {
      const next = await api<User>("/api/users", { method: "PATCH", body: { id: u.id, ...change } });
      setRows(rows.map((r) => r.id === u.id ? { ...r, ...next, scope: next.scope ?? r.scope } : r));
      toast(msg);
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر التعديل", "error");
    }
  }

  function editScope(u: User) {
    setScopeUserId(u.id);
    setScopeDraft({
      unrestricted: u.scope?.unrestricted ?? true,
      accountIds: [...(u.scope?.accountIds ?? [])],
      pageIds: [...(u.scope?.pageIds ?? [])],
    });
  }

  const toggle = (list: string[], value: string) => list.includes(value) ? list.filter((id) => id !== value) : [...list, value];

  async function saveScope() {
    if (!scopeUser) return;
    setBusy(true);
    try {
      const next = await api<User>("/api/users", { method: "PATCH", body: { id: scopeUser.id, scope: scopeDraft } });
      setRows(rows.map((row) => row.id === scopeUser.id ? { ...row, ...next, scope: next.scope ?? scopeDraft } : row));
      toast("تم حفظ نطاق الوصول");
      setScopeUserId(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر حفظ النطاق", "error");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="card card-flush"><div className="card-header" style={{ padding: "16px 20px 0" }}><h2>أعضاء الفريق</h2><small>{rows.length}</small></div>
      {!rows.length ? <div className="empty-state"><strong>لا يوجد أعضاء بعد</strong><small>أضف أول عضو من النموذج أدناه.</small></div> :
      <div className="responsive-table"><table className="data-table"><thead><tr><th>العضو</th><th>الدور</th><th>النطاق</th><th>الحالة</th><th>آخر دخول</th><th><span className="sr-only">إجراءات</span></th></tr></thead><tbody>{rows.map((u) => <tr key={u.id}>
        <td data-label="العضو"><b style={{ color: "var(--heading)", fontWeight: 500 }}>{u.name ?? u.email}</b><span className="cell-meta" dir="ltr" style={{ textAlign: "right" }}>{u.email}</span></td>
        <td data-label="الدور"><select aria-label="الدور" value={u.role} onChange={(e) => patch(u, { role: e.target.value }, "تم تغيير الدور (يسري عند الدخول القادم)")} style={{ width: "auto" }}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
        <td data-label="النطاق"><button className="btn btn-secondary btn-sm" onClick={() => editScope(u)}>{u.scope?.unrestricted ? "كل الحسابات" : `${u.scope?.accountIds.length ?? 0} حساب · ${u.scope?.pageIds.length ?? 0} صفحة`}</button></td>
        <td data-label="الحالة"><span className={`badge ${u.isActive ? "badge-success" : "badge-neutral"}`}>{u.isActive ? "نشط" : "معطل"}</span></td>
        <td data-label="آخر دخول" className="num">{riyadh(u.lastLoginAt)}</td>
        <td><div className="row-actions"><button className="btn btn-ghost btn-sm" onClick={async () => { const pw = prompt("كلمة مرور جديدة (10 أحرف على الأقل)"); if (pw) patch(u, { password: pw }, "تم تغيير كلمة المرور"); }}>كلمة المرور</button><button className={`btn btn-ghost btn-sm ${u.isActive ? "danger" : ""}`} onClick={async () => { if (!u.isActive || await confirmDialog({ title: `تعطيل ${u.name ?? u.email}؟`, message: "يفقد الوصول فورًا.", danger: true, confirmLabel: "تعطيل" })) patch(u, { isActive: !u.isActive }, u.isActive ? "عُطل الحساب" : "فُعّل الحساب"); }}>{u.isActive ? "تعطيل" : "تفعيل"}</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>

    {scopeUser && <section className="card">
      <div className="card-header"><div><h2>نطاق وصول: {scopeUser.name ?? scopeUser.email}</h2><small>يُطبّق على الخادم على المحتوى وصندوق الوارد.</small></div><button className="btn btn-ghost btn-sm" onClick={() => setScopeUserId(null)}>إغلاق</button></div>
      <label className="setting-row"><div><strong>كل الحسابات والصفحات</strong><small>اتركه مفعّلًا إذا كان العضو يجب أن يرى كل القنوات الحالية والمستقبلية.</small></div><input type="checkbox" checked={scopeDraft.unrestricted} onChange={(e) => setScopeDraft({ ...scopeDraft, unrestricted: e.target.checked })} /></label>
      {!scopeDraft.unrestricted && <>
        <div className="stack" style={{ gap: 8 }}>
          <strong>حسابات Meta</strong>
          <div className="chips">{accounts.length ? accounts.map((account) => <label className="chip" key={account.id}><input type="checkbox" checked={scopeDraft.accountIds.includes(account.id)} onChange={() => setScopeDraft({ ...scopeDraft, accountIds: toggle(scopeDraft.accountIds, account.id) })} />{account.name}</label>) : <small>لا توجد حسابات Meta متعددة بعد.</small>}</div>
        </div>
        <div className="stack" style={{ gap: 8, marginTop: 14 }}>
          <strong>صفحات إضافية محددة</strong>
          <small>يمكن منح صفحة بعينها حتى لو لم تمنح الحساب كاملًا.</small>
          <div className="chips">{pages.map((page) => <label className="chip" key={page.id}><input type="checkbox" checked={scopeDraft.pageIds.includes(page.id)} onChange={() => setScopeDraft({ ...scopeDraft, pageIds: toggle(scopeDraft.pageIds, page.id) })} />{page.name} · {page.platform === "instagram" ? "Instagram" : "Facebook"}</label>)}</div>
        </div>
      </>}
      <div className="form-actions"><button className="btn btn-primary" disabled={busy} onClick={saveScope}>{busy ? "جارٍ الحفظ…" : "حفظ النطاق"}</button></div>
    </section>}

    <form className="card" onSubmit={add}><div className="card-header"><h2>إضافة عضو</h2></div>
      <div className="field-row"><label>الاسم<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>البريد<input required type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label></div>
      <div className="field-row"><label>الدور<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label><label>كلمة مرور مبدئية<input required type="password" dir="ltr" minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small>10 أحرف على الأقل. تُحفظ مشفرة (scrypt).</small></label></div>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy}>إضافة العضو</button></div>
    </form>
  </>;
}

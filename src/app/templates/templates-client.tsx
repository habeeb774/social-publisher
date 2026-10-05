"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { POST_CATEGORIES, TEMPLATE_CATEGORIES } from "@/services/catalog";
import { api, riyadh } from "../ui/api";

type Template = { id: string; name: string; content: string; category: string; defaultSettings: { category?: string; tags?: string[] }; createdAt: string; updatedAt: string };
const empty = { name: "", content: "", category: "عام", postCategory: "", tags: "" };

export function TemplatesClient({ initial }: { initial: Template[] }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("الكل");
  const [message, setMessage] = useState("");
  const edit = (t: Template) => { setEditing(t.id); setForm({ name: t.name, content: t.content, category: t.category, postCategory: t.defaultSettings.category ?? "", tags: (t.defaultSettings.tags ?? []).join(" ") }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  async function save(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const body = { name: form.name, content: form.content, category: form.category, defaultSettings: { ...(form.postCategory ? { category: form.postCategory } : {}), ...(form.tags.trim() ? { tags: form.tags.split(/\s+/).filter(Boolean) } : {}) } };
    try {
      const saved = await api<Template>(editing ? `/api/templates/${editing}` : "/api/templates", { method: editing ? "PATCH" : "POST", body });
      setItems(editing ? items.map((i) => i.id === editing ? saved : i) : [saved, ...items]); setForm(empty); setEditing(null); setMessage("تم الحفظ");
    } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  async function remove(t: Template) {
    if (!confirm(`حذف القالب «${t.name}»؟`)) return;
    try { await api(`/api/templates/${t.id}`, { method: "DELETE" }); setItems(items.filter((i) => i.id !== t.id)); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الحذف"); }
  }
  const shown = filter === "الكل" ? items : items.filter((i) => i.category === filter);
  return <div className="form-layout">
    <section className="card form-card"><h2>{editing ? "تعديل القالب" : "قالب جديد"}</h2>
      <form className="post-form" onSubmit={save}>
        <label>الاسم<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>نوع القالب<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>المحتوى<textarea required rows={7} value={form.content} placeholder="مثلًا: 🎉 عرض خاص على [اسم المنتج]…" onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
        <div className="field-row"><label>تصنيف المنشور الافتراضي<select value={form.postCategory} onChange={(e) => setForm({ ...form, postCategory: e.target.value })}><option value="">بدون</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>وسوم افتراضية<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
        <div className="form-actions"><button className="btn btn-primary">حفظ القالب</button>{editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm(empty); }}>إلغاء</button>}</div>
      </form>{message && <p className="banner" role="status">{message}</p>}
    </section>
    <section><nav className="status-tabs">{["الكل", ...TEMPLATE_CATEGORIES].map((c) => <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{c}</button>)}</nav>
      {!shown.length ? <div className="card empty-state"><strong>لا توجد قوالب</strong><small>أنشئ قالبك الأول لتسريع الكتابة.</small></div> :
        <div className="card-grid">{shown.map((t) => <article id={t.id} key={t.id} className="card template-card"><header><strong>{t.name}</strong><span className="chip">{t.category}</span></header><p style={{ whiteSpace: "pre-wrap" }}>{t.content.slice(0, 220)}{t.content.length > 220 ? "…" : ""}</p><small>آخر تحديث {riyadh(t.updatedAt)}</small>
          <div className="form-actions"><Link className="btn btn-primary" href={`/posts/new?template=${t.id}`}>استخدام</Link><button className="btn btn-secondary" onClick={() => edit(t)}>تعديل</button><button className="link-button" onClick={() => remove(t)}>حذف</button></div></article>)}</div>}
    </section>
  </div>;
}

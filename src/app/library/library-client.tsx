"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, riyadh } from "../ui/api";

type Item = { id: string; kind: string; title: string; body: string; mediaUrl: string | null; status: string; tags: string[]; updatedAt: string };
const KINDS: Record<string, string> = { text: "نص", image: "صورة", idea: "فكرة", post: "منشور جاهز", template: "مسودة قالب" };
const STATUSES: Record<string, string> = { new: "جديدة", planned: "مخطط لها", converted: "تحولت لمنشور", dismissed: "مستبعدة" };
const empty = { kind: "text", title: "", body: "", mediaUrl: "", tags: "" };

/** Shared by /library (all kinds) and /ideas (ideas board with statuses). */
export function LibraryClient({ initial, ideasOnly = false, uploadEnabled = false }: { initial: Item[]; ideasOnly?: boolean; uploadEnabled?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({ ...empty, kind: ideasOnly ? "idea" : "text" });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageInfo, setImageInfo] = useState<{ name: string; size?: number } | null>(null);
  async function add(e: FormEvent) {
    e.preventDefault(); setMessage("");
    try { const row = await api<Item>("/api/library", { method: "POST", body: { kind: form.kind, title: form.title, body: form.body, mediaUrl: form.mediaUrl.trim() || null, tags: form.tags.split(/\s+/).filter(Boolean) } }); setItems([row, ...items]); setForm({ ...empty, kind: form.kind }); setImageInfo(null); setMessage("تم الحفظ في المكتبة"); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  async function upload(file: File) {
    setMessage(""); setUploading(true);
    const body = new FormData(); body.append("file", file);
    try {
      const asset = await api<{ url: string; name: string; size: number }>("/api/media", { method: "POST", body });
      setForm((current) => ({ ...current, mediaUrl: asset.url }));
      setImageInfo({ name: asset.name, size: asset.size });
      setMessage("تم رفع الصورة بنجاح");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }
  async function setStatus(item: Item, status: string) { const row = await api<Item>(`/api/library/${item.id}`, { method: "PATCH", body: { status } }); setItems(items.map((i) => i.id === item.id ? row : i)); }
  async function convert(item: Item) { try { const post = await api<{ id: string }>(`/api/library/${item.id}`, { method: "POST", body: { action: "convert" } }); router.push(`/posts/${post.id}/edit`); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر التحويل"); } }
  async function remove(item: Item) { if (!confirm(`حذف «${item.title}»؟`)) return; await api(`/api/library/${item.id}`, { method: "DELETE" }); setItems(items.filter((i) => i.id !== item.id)); }
  const shown = items.filter((i) => (ideasOnly ? (filter === "all" || i.status === filter) : (filter === "all" || i.kind === filter)) && (!q || `${i.title} ${i.body}`.includes(q)));
  const tabs = ideasOnly ? Object.entries(STATUSES) : Object.entries(KINDS);
  return <div className="form-layout">
    <section>
      <nav className="status-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>الكل <b>{items.length}</b></button>{tabs.map(([k, l]) => <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l} <b>{items.filter((i) => (ideasOnly ? i.status : i.kind) === k).length}</b></button>)}</nav>
      <input className="library-search" aria-label="بحث" placeholder="ابحث في المكتبة…" value={q} onChange={(e) => setQ(e.target.value)} />
      {message && <p className="banner" role="alert">{message}</p>}
      {!shown.length ? <div className="card empty-state"><strong>{ideasOnly ? "لا توجد أفكار" : "المكتبة فارغة"}</strong><small>{ideasOnly ? "سجّل أي فكرة منشور قبل أن تنساها." : "احفظ نصوصًا وصورًا وأفكارًا لتعيد استخدامها."}</small></div> :
        <div className="card-grid">{shown.map((i) => <article key={i.id} className="card"><header className="row-between"><strong>{i.title}</strong><span className="chip">{ideasOnly ? STATUSES[i.status] : KINDS[i.kind]}</span></header>
          {i.body && <p style={{ whiteSpace: "pre-wrap" }}>{i.body.slice(0, 220)}{i.body.length > 220 ? "…" : ""}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {i.mediaUrl && <img className="preview-image" src={i.mediaUrl} alt={i.title} loading="lazy" />}
          {i.tags.length > 0 && <span className="chips">{i.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</span>}
          <small>{riyadh(i.updatedAt)}</small>
          <div className="form-actions">
            {i.status !== "converted" && <button className="btn btn-primary" onClick={() => convert(i)}>إنشاء مسودة</button>}
            {i.kind === "idea" && i.status !== "converted" && <select aria-label="حالة الفكرة" value={i.status} onChange={(e) => setStatus(i, e.target.value)}>{Object.entries(STATUSES).filter(([k]) => k !== "converted").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
            <button className="link-button" onClick={() => remove(i)}>حذف</button>
          </div></article>)}</div>}
    </section>
    <form className="post-form panel-card" onSubmit={add}><h2>{ideasOnly ? "فكرة جديدة" : "إضافة للمكتبة"}</h2>
      {!ideasOnly && <label>النوع<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
      <label>العنوان<input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>{ideasOnly ? "تفاصيل الفكرة" : "النص"}<textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
      {(form.kind === "image" || form.kind === "post") && <div className="library-media-field">
        <span className="field-label">الصورة</span>
        {form.mediaUrl ? <div className="library-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="preview-image" src={form.mediaUrl} alt="معاينة الصورة" />
          <div className="row-between">
            <small>{imageInfo?.name ?? "صورة مضافة"}{imageInfo?.size ? ` · ${Math.max(1, Math.round(imageInfo.size / 1024))} KB` : ""}</small>
            <div className="form-actions">
              {uploadEnabled && <label className={`btn btn-secondary ${uploading ? "disabled" : ""}`}>تغيير الصورة<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>}
              <button type="button" className="btn btn-ghost danger" onClick={() => { setForm({ ...form, mediaUrl: "" }); setImageInfo(null); }}>إزالة</button>
            </div>
          </div>
        </div> : uploadEnabled ? <label className={`dropzone ${uploading ? "disabled" : ""}`}>
          <span>＋</span>
          <strong>{uploading ? "جارٍ رفع الصورة…" : "اختر صورة من جهازك"}</strong>
          <small>JPG أو PNG أو WebP · حتى 10MB</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label> : <p className="alert alert-warning">رفع الملفات غير متاح حاليًا. يمكنك استخدام رابط مباشر أدناه.</p>}
        <details className="disclosure">
          <summary>أو استخدم رابط صورة مباشر</summary>
          <label>رابط الصورة<input type="url" inputMode="url" dir="ltr" placeholder="https://…" value={form.mediaUrl} onChange={(e) => { setForm({ ...form, mediaUrl: e.target.value }); setImageInfo(null); }} /></label>
        </details>
      </div>}
      <label>وسوم<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label>
      <button className="btn btn-primary">حفظ</button>
    </form>
  </div>;
}

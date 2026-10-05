"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, riyadh } from "../ui/api";

type Asset = { id: string; name: string; url: string; mimeType: string | null; size: number | null; source: string; createdAt: string };
const kb = (n: number | null) => n ? n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB` : "—";

export function MediaClient({ initial, uploadEnabled, initialQuery }: { initial: Asset[]; uploadEnabled: boolean; initialQuery: string }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState(initialQuery);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function search(e?: FormEvent) { e?.preventDefault(); const r = await api<{ items: Asset[] }>(`/api/media?q=${encodeURIComponent(q)}`); setItems(r.items); }
  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try { const a = await api<Asset>("/api/media", { method: "POST", body: { url } }); setItems([a, ...items]); setUrl(""); setMessage("أُضيفت الصورة"); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذرت الإضافة"); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    setBusy(true); setMessage("");
    const form = new FormData(); form.append("file", file);
    try { const a = await api<Asset>("/api/media", { method: "POST", body: form }); setItems([a, ...items]); setMessage("تم رفع الصورة"); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الرفع"); } finally { setBusy(false); }
  }
  async function remove(a: Asset) {
    if (!confirm(`حذف «${a.name}» من المكتبة؟`)) return;
    try { await api(`/api/media/${a.id}`, { method: "DELETE" }); setItems(items.filter((i) => i.id !== a.id)); setSelected(null); } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الحذف"); }
  }
  return <>
    <div className="media-toolbar panel-card">
      <form onSubmit={search} className="inline-field"><input aria-label="بحث في الوسائط" placeholder="ابحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="secondary-button">بحث</button></form>
      <form onSubmit={add} className="inline-field"><input aria-label="رابط صورة" type="url" placeholder="https://… رابط صورة مباشر" value={url} onChange={(e) => setUrl(e.target.value)} required /><button className="secondary-button" disabled={busy}>إضافة برابط</button></form>
      <label className={`primary-button ${!uploadEnabled || busy ? "disabled" : ""}`} title={uploadEnabled ? "" : "الرفع يحتاج إعداد Vercel Blob"}>رفع صورة<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={!uploadEnabled || busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
    </div>
    {!uploadEnabled && <p className="banner">الرفع المباشر غير مفعّل بعد (يحتاج Vercel Blob). يمكنك إضافة الصور برابط مباشر.</p>}
    {message && <p className="banner" role="status">{message}</p>}
    {!items.length ? <div className="panel-card empty-state"><strong>لا توجد صور</strong><small>أضف صورة برابط أو ارفعها.</small></div> :
      <div className="media-grid">{items.map((a) => <button key={a.id} className={`media-tile ${selected?.id === a.id ? "active" : ""}`} onClick={() => setSelected(a)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={a.url} alt={a.name} loading="lazy" /><span>{a.name}</span></button>)}</div>}
    {selected && <aside className="panel-card media-info" aria-label="معلومات الملف"><h2>{selected.name}</h2>
      <dl><dt>النوع</dt><dd>{selected.mimeType ?? "—"}</dd><dt>الحجم</dt><dd>{kb(selected.size)}</dd><dt>المصدر</dt><dd>{selected.source === "upload" ? "مرفوع" : "رابط"}</dd><dt>أُضيف</dt><dd>{riyadh(selected.createdAt)}</dd></dl>
      <div className="form-actions"><Link className="primary-button" href={`/posts/new?media=${selected.id}`}>استخدام في منشور</Link><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(selected.url)}>نسخ الرابط</button><button className="secondary-button danger" onClick={() => remove(selected)}>حذف</button><button className="link-button" onClick={() => setSelected(null)}>إغلاق</button></div>
    </aside>}
  </>;
}

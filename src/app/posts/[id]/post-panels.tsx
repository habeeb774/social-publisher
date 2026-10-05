"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { STATUS_LABELS, ago, api, riyadh } from "../../ui/api";

type Version = { id: string; content: string; scheduledAt: string | null; status: string; changedBy: string; reason: string; createdAt: string; mediaSnapshot: Array<{ url: string }> };
type Note = { id: string; body: string; author: string; createdAt: string };
type Perf = { available: boolean; reason?: string; metrics: Array<{ key: string; label: string; value: number }> };

export function PostActions({ id, status, approvalRequired }: { id: string; status: string; approvalRequired: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(fn: () => Promise<unknown>, done?: (r: unknown) => void) {
    setBusy(true); setMessage("");
    try { const r = await fn(); done ? done(r) : router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر التنفيذ"); } finally { setBusy(false); }
  }
  return <div className="post-actions">
    <button className="secondary-button" disabled={busy} onClick={() => run(() => api<{ id: string }>(`/api/posts/${id}/duplicate`, { method: "POST" }), (r) => router.push(`/posts/${(r as { id: string }).id}/edit`))}>تكرار المنشور</button>
    {["draft", "approved"].includes(status) && <button className="secondary-button" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/queue`, { method: "POST" }))}>إضافة إلى الطابور</button>}
    {status === "draft" && approvalRequired && <button className="secondary-button" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "submit" } }))}>إرسال للمراجعة</button>}
    {status === "pending_approval" && <>
      <button className="primary-button" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "approve" } }))}>موافقة</button>
      <button className="secondary-button" disabled={busy} onClick={() => { const reason = prompt("سبب الرفض (يظهر في الملاحظات)") ?? ""; run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "reject", reason } })); }}>رفض</button>
    </>}
    {message && <p className="banner" role="alert">{message}</p>}
  </div>;
}

export function VersionHistory({ id, editable }: { id: string; editable: boolean }) {
  const router = useRouter();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { api<Version[]>(`/api/posts/${id}/versions`).then(setVersions).catch(() => setVersions([])); }, [id]);
  async function restore(versionId: string) {
    if (!confirm("استرجاع هذه النسخة؟ تُحفظ النسخة الحالية في السجل أولًا. لا يتغير أي منشور على Facebook.")) return;
    try { await api(`/api/posts/${id}/versions/${versionId}`, { method: "POST" }); setMessage("تم الاسترجاع"); router.refresh(); api<Version[]>(`/api/posts/${id}/versions`).then(setVersions); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر الاسترجاع"); }
  }
  return <section className="panel-card"><h2>سجل التعديلات</h2>
    {message && <p className="banner" role="status">{message}</p>}
    {versions === null ? <p>جارٍ التحميل…</p> : !versions.length ? <p>لا توجد نسخ سابقة. تُحفظ نسخة عند كل تعديل.</p> : <ul className="timeline-list">{versions.map((v) => <li key={v.id}>
      <button className="link-button" onClick={() => setOpen(open === v.id ? null : v.id)}>{ago(v.createdAt)} · {v.reason === "before_restore" ? "قبل الاسترجاع" : "قبل التعديل"} · {STATUS_LABELS[v.status] ?? v.status}</button>
      <small>{riyadh(v.createdAt)} · بواسطة {v.changedBy}</small>
      {open === v.id && <div className="version-body"><p style={{ whiteSpace: "pre-wrap" }}>{v.content}</p><small>الموعد: {riyadh(v.scheduledAt)}{v.mediaSnapshot.length ? ` · ${v.mediaSnapshot.length} صورة` : ""}</small>{editable && <button className="secondary-button" onClick={() => restore(v.id)}>استرجاع هذه النسخة</button>}</div>}
    </li>)}</ul>}
  </section>;
}

export function InternalNotes({ id }: { id: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<Note[]>(`/api/posts/${id}/notes`).then(setNotes).catch(() => undefined); }, [id]);
  async function add(e: FormEvent) {
    e.preventDefault(); setError("");
    try { const note = await api<Note>(`/api/posts/${id}/notes`, { method: "POST", body: { body: text } }); setNotes((n) => [...n, note]); setText(""); } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  const render = (body: string) => body.split(/(@[\p{L}\p{N}_.-]+)/gu).map((part, i) => part.startsWith("@") ? <b key={i} className="mention">{part}</b> : part);
  return <section className="panel-card"><h2>ملاحظات داخلية</h2><small>تبقى داخل النظام فقط ولا تُرسل إلى Facebook. استخدم @الاسم للإشارة.</small>
    <ul className="timeline-list">{notes.map((n) => <li key={n.id}><p style={{ whiteSpace: "pre-wrap" }}>{render(n.body)}</p><small>{n.author} · {ago(n.createdAt)}</small></li>)}</ul>
    <form onSubmit={add} className="inline-field"><input aria-label="ملاحظة جديدة" placeholder="مثلًا: غيّر الصورة" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /><button className="secondary-button" disabled={!text.trim()}>إضافة</button></form>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function PostPerformance({ id }: { id: string }) {
  const [perf, setPerf] = useState<Perf | null>(null);
  useEffect(() => { api<Perf>(`/api/posts/${id}/performance`).then(setPerf).catch(() => setPerf({ available: false, reason: "تعذر جلب البيانات", metrics: [] })); }, [id]);
  return <section className="panel-card"><h2>الأداء</h2>
    {!perf ? <p>جارٍ جلب بيانات Facebook…</p> : !perf.available ? <p>{perf.reason}</p> : <div className="metrics-row compact">{perf.metrics.map((m) => <div className="metric" key={m.key}><small>{m.label}</small><strong>{m.value.toLocaleString("ar-SA")}</strong></div>)}</div>}
    <small>البيانات من Facebook Graph API، وتُحدّث كل 30 دقيقة. تُعرض فقط الحقول التي يرجعها Facebook فعلًا.</small>
  </section>;
}

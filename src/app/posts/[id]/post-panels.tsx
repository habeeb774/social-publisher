"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { STATUS_LABELS, ago, api, riyadh } from "../../ui/api";
import { confirmDialog, toast } from "../../ui/feedback";
import { Icon } from "../../ui/icons";
import { Skeleton } from "../../ui/kit";

type Version = { id: string; content: string; scheduledAt: string | null; status: string; changedBy: string; reason: string; createdAt: string; mediaSnapshot: Array<{ url: string }> };
type Note = { id: string; body: string; author: string; createdAt: string };
type Perf = { available: boolean; reason?: string; metrics: Array<{ key: string; label: string; value: number }> };
const REASONS: Record<string, string> = { edit: "قبل التعديل", before_restore: "قبل الاسترجاع", reschedule: "قبل نقل الموعد" };

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, success: string, after?: (r: unknown) => void) {
    setBusy(true);
    try { const r = await fn(); toast(success); after ? after(r) : router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "تعذر التنفيذ", "error"); } finally { setBusy(false); }
  }
  return { busy, run, router };
}

export function PostActions({ id, status, approvalRequired }: { id: string; status: string; approvalRequired: boolean }) {
  const { busy, run, router } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return <div className="post-actions">
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api<{ id: string }>(`/api/posts/${id}/duplicate`, { method: "POST" }), "أُنشئت نسخة كمسودة", (r) => router.push(`/posts/${(r as { id: string }).id}/edit`))}><Icon name="copy" width={14} />تكرار</button>
    {["draft", "approved"].includes(status) && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/queue`, { method: "POST" }), "أُضيف إلى الطابور")}><Icon name="queue" width={14} />إضافة للطابور</button>}
    {["draft", "approved", "scheduled"].includes(status) && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { if (await confirmDialog({ title: "نشر الآن؟", message: "يُنشر خلال دقيقة عبر عامل النشر.", confirmLabel: "نشر الآن" })) run(() => api(`/api/posts/${id}/publish-now`, { method: "POST" }), "سيُنشر خلال دقيقة"); }}><Icon name="send" width={14} />نشر الآن</button>}
    {status === "draft" && approvalRequired && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "submit" } }), "أُرسل للمراجعة")}><Icon name="review" width={14} />إرسال للمراجعة</button>}
    {status === "pending_approval" && <>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "approve" } }), "تمت الموافقة")}><Icon name="check" width={14} />موافقة</button>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRejecting(true)}>رفض / طلب تعديل</button>
    </>}
    {rejecting && <><div className="dialog-backdrop" onClick={() => setRejecting(false)} /><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">إعادة المنشور للمحرر</h2><label>السبب (يظهر في الملاحظات الداخلية)<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: غيّر الصورة وراجع السعر" /></label><div className="form-actions"><button className="btn btn-primary" onClick={() => { setRejecting(false); run(() => api(`/api/posts/${id}/approval`, { method: "POST", body: { action: "reject", reason } }), "أُعيد للمحرر"); }}>إرسال</button><button className="btn btn-secondary" onClick={() => setRejecting(false)}>إلغاء</button></div></div></>}
  </div>;
}

export function RetryButton({ id, retryable, uncertain }: { id: string; retryable: boolean; uncertain: boolean }) {
  const { busy, run } = useAction();
  if (!retryable && !uncertain) return null;
  return <button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => {
    if (uncertain && !await confirmDialog({ title: "هل تأكدت أن المنشور غير موجود على الصفحة؟", message: "النتيجة غير مؤكدة: إن كان المنشور نُشر فعلًا فإعادة المحاولة ستكرره.", confirmLabel: "تأكدت — أعد المحاولة", danger: true })) return;
    run(() => api(`/api/posts/${id}/retry`, { method: "POST", body: { confirmedNotPublished: uncertain } }), "أُعيدت الجدولة للتشغيل القادم");
  }}>إعادة المحاولة</button>;
}

export function VersionHistory({ id, editable }: { id: string; editable: boolean }) {
  const { run } = useAction();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api<Version[]>(`/api/posts/${id}/versions`).then(setVersions).catch(() => setVersions([]));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function restore(versionId: string) {
    if (!await confirmDialog({ title: "استرجاع هذه النسخة؟", message: "تُحفظ النسخة الحالية في السجل أولًا. لا يتغير أي منشور على Facebook." , confirmLabel: "استرجاع" })) return;
    run(() => api(`/api/posts/${id}/versions/${versionId}`, { method: "POST" }), "تم الاسترجاع", () => { load(); location.reload(); });
  }
  return <section className="card"><div className="card-header"><h2>سجل التعديلات</h2>{versions && <small>{versions.length} نسخة</small>}</div>
    {versions === null ? <Skeleton lines={2} /> : !versions.length ? <small>لا توجد نسخ سابقة. تُحفظ نسخة عند كل تعديل مهم.</small> : <ul className="timeline-list">{versions.map((v) => <li key={v.id}>
      <button className="link-button" style={{ textAlign: "right" }} aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>{ago(v.createdAt)} · {REASONS[v.reason] ?? v.reason} · {STATUS_LABELS[v.status] ?? v.status}</button>
      <small>{riyadh(v.createdAt)} · {v.changedBy}</small>
      {open === v.id && <div className="version-body"><p className="pre">{v.content}</p><small>الموعد: {riyadh(v.scheduledAt)}{v.mediaSnapshot.length ? ` · ${v.mediaSnapshot.length} صورة` : ""}</small>{editable && <div><button className="btn btn-secondary btn-sm" onClick={() => restore(v.id)}>استرجاع هذه النسخة</button></div>}</div>}
    </li>)}</ul>}
  </section>;
}

export function InternalNotes({ id, endpoint }: { id: string; endpoint?: string }) {
  const url = endpoint ?? `/api/posts/${id}/notes`;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { api<Note[]>(url).then(setNotes).catch(() => setNotes([])); }, [url]);
  async function add(e: FormEvent) {
    e.preventDefault();
    try { const note = await api<Note>(url, { method: "POST", body: { body: text } }); setNotes((n) => [...(n ?? []), note]); setText(""); } catch (err) { toast(err instanceof Error ? err.message : "تعذر الحفظ", "error"); }
  }
  const render = (body: string) => body.split(/(@[\p{L}\p{N}_.-]+)/gu).map((part, i) => part.startsWith("@") ? <b key={i} className="mention">{part}</b> : part);
  return <section className="card"><div className="card-header"><h2>ملاحظات داخلية</h2><small>لا تُرسل إلى Facebook</small></div>
    {notes === null ? <Skeleton lines={1} /> : !notes.length ? <small>لا توجد ملاحظات. استخدم @الاسم للإشارة إلى زميل.</small> : <ul className="timeline-list">{notes.map((n) => <li key={n.id}><p className="pre">{render(n.body)}</p><small>{n.author} · {ago(n.createdAt)}</small></li>)}</ul>}
    <form onSubmit={add} className="inline-field"><input aria-label="ملاحظة جديدة" placeholder="مثلًا: غيّر الصورة" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /><button className="btn btn-secondary" disabled={!text.trim()}>إضافة</button></form>
  </section>;
}

export function PostPerformance({ id }: { id: string }) {
  const [perf, setPerf] = useState<Perf | null>(null);
  useEffect(() => { api<Perf>(`/api/posts/${id}/performance`).then(setPerf).catch(() => setPerf({ available: false, reason: "تعذر جلب البيانات", metrics: [] })); }, [id]);
  return <section className="card"><div className="card-header"><h2>الأداء</h2><small>من Facebook · يُحدّث كل 30 دقيقة</small></div>
    {!perf ? <Skeleton lines={1} /> : !perf.available ? <small>{perf.reason}</small> : <div className="metric-strip compact" style={{ marginBottom: 0, boxShadow: "none" }}>{perf.metrics.filter((m) => !m.key.includes(".")).map((m) => <div className="metric" key={m.key}><small>{m.label}</small><strong>{m.value.toLocaleString("ar-SA")}</strong></div>)}</div>}
  </section>;
}

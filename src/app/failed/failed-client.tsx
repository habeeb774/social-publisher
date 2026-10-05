"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, riyadh } from "../ui/api";

type Row = { id: string; content: string; lastError: string | null; failedAt: string | null; attempts: number; lastAttempt: string | null; kind: { key: string; label: string; retryable: boolean; hint: string } };

export function FailedClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const retryable = rows.filter((r) => r.kind.retryable);
  async function retry(ids: string[], confirmedNotPublished = false) {
    setBusy(true); setMessage("");
    const results = await Promise.allSettled(ids.map((id) => api(`/api/posts/${id}/retry`, { method: "POST", body: { confirmedNotPublished } })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    setMessage(`أُعيدت جدولة ${ok} للنشر في التشغيل القادم${firstError ? ` · تعذر ${results.length - ok}: ${firstError.reason?.message}` : ""}`);
    setSelected(new Set()); setBusy(false); router.refresh();
  }
  if (!rows.length) return <div className="panel-card empty-state"><strong>لا توجد منشورات فاشلة 🎉</strong><small>كل المنشورات نُشرت أو ما زالت مجدولة.</small></div>;
  return <>
    <div className="bulk-bar panel-card"><strong>{rows.length} فاشل · {retryable.length} قابل لإعادة المحاولة</strong>
      <button className="primary-button" disabled={busy || !selected.size} onClick={() => retry([...selected])}>إعادة المحددة ({selected.size})</button>
      <button className="secondary-button" disabled={busy || !retryable.length} onClick={() => retry(retryable.map((r) => r.id))}>إعادة كل القابلة</button></div>
    {message && <p className="banner" role="status">{message}</p>}
    <div className="card-grid">{rows.map((r) => <article key={r.id} className="panel-card failed-card">
      <header>{r.kind.retryable && <input type="checkbox" aria-label="تحديد" checked={selected.has(r.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />}<span className={`status-pill error-${r.kind.key}`}>{r.kind.label}</span><small>{r.attempts} محاولة · آخرها {riyadh(r.lastAttempt)}</small></header>
      <Link href={`/posts/${r.id}`}><p>{r.content.slice(0, 160)}{r.content.length > 160 ? "…" : ""}</p></Link>
      <p className="hint">💡 {r.kind.hint}</p>
      <details><summary>تفاصيل الخطأ</summary><code className="error-detail">{r.lastError}</code></details>
      <div className="form-actions">
        {r.kind.retryable ? <button className="secondary-button" disabled={busy} onClick={() => retry([r.id])}>إعادة المحاولة</button>
          : r.kind.key === "uncertain" ? <button className="secondary-button" disabled={busy} onClick={() => confirm("هل تأكدت من صفحة فيسبوك أن المنشور غير موجود؟ إعادة المحاولة إن كان منشورًا ستكرره.") && retry([r.id], true)}>تأكدت أنه لم يُنشر — أعد المحاولة</button>
          : <Link className="secondary-button" href={`/posts/${r.id}`}>عرض المنشور</Link>}
      </div>
    </article>)}</div>
  </>;
}

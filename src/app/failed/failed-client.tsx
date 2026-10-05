"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, riyadh } from "../ui/api";
import { confirmDialog, toast } from "../ui/feedback";
import { EmptyState } from "../ui/empty-state";
import { StatusBadge } from "../ui/status-badge";

type Row = { id: string; content: string; lastError: string | null; failedAt: string | null; attempts: number; lastAttempt: string | null; kind: { key: string; label: string; retryable: boolean; hint: string } };
const code = (e: string | null) => e?.match(/^([A-Z_]+)/)?.[1] ?? null;

export function FailedClient({ rows, canRetry }: { rows: Row[]; canRetry: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const retryable = rows.filter((r) => r.kind.retryable);
  async function retry(ids: string[], confirmedNotPublished = false) {
    setBusy(true);
    const results = await Promise.allSettled(ids.map((id) => api(`/api/posts/${id}/retry`, { method: "POST", body: { confirmedNotPublished } })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    toast(`أُعيدت جدولة ${ok} للتشغيل القادم${firstError ? ` · تعذر ${results.length - ok}: ${firstError.reason?.message}` : ""}`, firstError ? "warning" : "success");
    setSelected(new Set()); setBusy(false); router.refresh();
  }
  if (!rows.length) return <EmptyState icon="check" title="لا توجد منشورات فاشلة" description="كل المنشورات نُشرت أو ما زالت مجدولة." />;
  return <>
    {canRetry && <div className="bulk-bar"><strong>{rows.length} فاشل · {retryable.length} قابل لإعادة المحاولة</strong><button className="btn btn-primary btn-sm" disabled={busy || !selected.size} onClick={() => retry([...selected])}>إعادة المحددة ({selected.size})</button><button className="btn btn-secondary btn-sm" disabled={busy || !retryable.length} onClick={() => retry(retryable.map((r) => r.id))}>إعادة كل القابلة</button></div>}
    <div className="responsive-table"><table className="data-table"><thead><tr><th><span className="sr-only">تحديد</span></th><th>المنشور</th><th>النوع</th><th>السبب</th><th>المحاولات</th><th>آخر محاولة</th><th><span className="sr-only">إجراء</span></th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>
        <td>{canRetry && r.kind.retryable && <input type="checkbox" aria-label="تحديد" checked={selected.has(r.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />}</td>
        <td data-label="المحتوى" style={{ minWidth: 240 }}><Link href={`/posts/${r.id}`} className="cell-content clamp-2">{r.content}</Link></td>
        <td data-label="النوع"><StatusBadge tone={r.kind.retryable ? "warning" : "danger"}>{r.kind.label}</StatusBadge></td>
        <td data-label="السبب" style={{ minWidth: 220 }}><span className="hint">{r.kind.hint}</span>{code(r.lastError) && <span className="cell-meta"><code>{code(r.lastError)}</code></span>}<details className="disclosure"><summary>التفاصيل التقنية</summary><code className="error-detail">{r.lastError}</code></details></td>
        <td data-label="المحاولات" className="num">{r.attempts}</td>
        <td data-label="آخر محاولة" className="nowrap num">{riyadh(r.lastAttempt)}</td>
        <td>{canRetry && (r.kind.retryable ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => retry([r.id])}>إعادة</button>
          : r.kind.key === "uncertain" ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { if (await confirmDialog({ title: "هل تأكدت أن المنشور غير موجود على الصفحة؟", message: "إعادة المحاولة لمنشور نُشر فعلًا ستكرره.", danger: true, confirmLabel: "تأكدت — أعد" })) retry([r.id], true); }}>تأكدت — أعد</button>
          : <Link className="btn btn-ghost btn-sm" href={`/posts/${r.id}/edit`}>تعديل</Link>)}</td>
      </tr>)}</tbody></table></div>
  </>;
}

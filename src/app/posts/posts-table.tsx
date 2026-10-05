"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS, api, riyadh } from "../ui/api";

type Row = { id: string; content: string; status: string; scheduledAt: string | null; lastError: string | null; pageName: string | null; campaignName: string | null; category: string | null; tags: string[]; inQueue: boolean };
const ACTIONS: Array<[string, string]> = [["schedule", "جدولة"], ["to_draft", "نقل إلى مسودة"], ["unschedule", "إلغاء الجدولة"], ["archive", "أرشفة"], ["delete_drafts", "حذف المسودات"], ["change_page", "تغيير الصفحة"], ["assign_campaign", "ربط بحملة"]];

export function PostsTable({ rows, pages, campaigns }: { rows: Row[]; pages: Array<{ id: string; name: string }>; campaigns: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("schedule");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  async function run() {
    if (!selected.size) return;
    if ((action === "delete_drafts" || action === "archive") && !confirm(`تأكيد «${ACTIONS.find((a) => a[0] === action)?.[1]}» لـ ${selected.size} منشور؟`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await api<{ changed: string[]; skipped: Array<{ reason: string }> }>("/api/posts/bulk", { method: "POST", body: { ids: [...selected], action, value: value || null } });
      setMessage(`تم تنفيذ الإجراء على ${result.changed.length}${result.skipped.length ? ` · تم تخطي ${result.skipped.length} (${result.skipped[0].reason})` : ""}`);
      setSelected(new Set()); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر التنفيذ"); } finally { setBusy(false); }
  }
  async function duplicate(id: string) {
    try { const copy = await api<{ id: string }>(`/api/posts/${id}/duplicate`, { method: "POST" }); router.push(`/posts/${copy.id}/edit`); } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر التكرار"); }
  }
  return <>
    {selected.size > 0 && <div className="bulk-bar panel-card" role="region" aria-label="إجراءات جماعية">
      <strong>{selected.size} محدد</strong>
      <select aria-label="الإجراء" value={action} onChange={(e) => { setAction(e.target.value); setValue(""); }}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {action === "change_page" && <select aria-label="الصفحة" value={value} onChange={(e) => setValue(e.target.value)}><option value="">اختر الصفحة</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      {action === "assign_campaign" && <select aria-label="الحملة" value={value} onChange={(e) => setValue(e.target.value)}><option value="">بدون حملة</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <button className="primary-button" disabled={busy || (action === "change_page" && !value)} onClick={run}>{busy ? "جارٍ التنفيذ…" : "تنفيذ"}</button>
      <button className="secondary-button" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
    </div>}
    {message && <p className="banner" role="status">{message}</p>}
    <div className="responsive-table"><table className="data-table">
      <thead><tr><th><input type="checkbox" aria-label="تحديد الكل" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th><th>المحتوى</th><th>الصفحة</th><th>موعد النشر (الرياض)</th><th>الحالة</th><th>الإجراء</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className={selected.has(r.id) ? "selected" : ""}>
        <td><input type="checkbox" aria-label="تحديد المنشور" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
        <td data-label="المحتوى"><Link href={`/posts/${r.id}`} className="cell-content">{r.content.slice(0, 140)}{r.content.length > 140 ? "…" : ""}</Link>
          <span className="chips">{r.category && <span className="chip">{r.category}</span>}{r.campaignName && <span className="chip">حملة: {r.campaignName}</span>}{r.inQueue && <span className="chip">في الطابور</span>}{r.tags.map((t) => <span key={t} className="chip muted">#{t}</span>)}</span></td>
        <td data-label="الصفحة">{r.pageName ?? "صفحة غير متاحة"}</td>
        <td data-label="الموعد">{riyadh(r.scheduledAt)}</td>
        <td data-label="الحالة"><span className={`status-pill status-${r.status}`}>{STATUS_LABELS[r.status]}</span>{r.lastError && <small className="cell-error">{r.lastError.slice(0, 120)}</small>}</td>
        <td data-label="الإجراء"><span className="row-actions"><Link href={`/posts/${r.id}`}>التفاصيل</Link><button className="link-button" onClick={() => duplicate(r.id)}>تكرار</button></span></td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS, api, riyadh } from "../ui/api";
import { confirmDialog, toast } from "../ui/feedback";
import { Icon } from "../ui/icons";
import { RowMenu, type MenuItem } from "../ui/row-menu";
import { StatusBadge } from "../ui/status-badge";

export type PostRow = { id: string; content: string; status: string; scheduledAt: string | null; updatedAt: string; lastError: string | null; pageName: string | null; campaignName: string | null; category: string | null; tags: string[]; inQueue: boolean; image: string | null };
const BULK: Array<[string, string]> = [["schedule", "جدولة"], ["unschedule", "إلغاء الجدولة"], ["to_draft", "نقل إلى مسودة"], ["change_page", "تغيير الصفحة"], ["assign_campaign", "تغيير الحملة"], ["archive", "أرشفة"], ["delete_drafts", "حذف المسودات"]];
const EDITABLE = ["draft", "scheduled", "pending_approval", "approved"];

export function PostsTable({ rows, pages, campaigns, canWrite = true }: { rows: PostRow[]; pages: Array<{ id: string; name: string }>; campaigns: Array<{ id: string; name: string }>; canWrite?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("schedule");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function bulk(ids: string[], act: string, val: string | null = null) {
    setBusy(true);
    try {
      const result = await api<{ changed: string[]; skipped: Array<{ reason: string }> }>("/api/posts/bulk", { method: "POST", body: { ids, action: act, value: val } });
      toast(`تم على ${result.changed.length}${result.skipped.length ? ` · تُخطي ${result.skipped.length}: ${result.skipped[0].reason}` : ""}`, result.skipped.length ? "warning" : "success");
      setSelected(new Set()); router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر التنفيذ", "error"); } finally { setBusy(false); }
  }
  async function runBulk() {
    if (!selected.size) return;
    if (action === "change_page" && !await confirmDialog({ title: "تغيير صفحة المنشورات؟", message: "تعود المنشورات التي تتغير صفحتها إلى مسودات وتُلغى موافقتها وجدولتها القديمة. راجعها ثم أعد جدولة نشرها. المنشورات التي لها سجل نشر لن تُنقل.", confirmLabel: "تغيير الصفحة" })) return;
    if (["delete_drafts", "archive"].includes(action) && !await confirmDialog({ title: `${BULK.find((b) => b[0] === action)?.[1]} ${selected.size} منشور؟`, message: action === "delete_drafts" ? "تُنقل المسودات إلى سلة المحذوفات لمدة 30 يومًا. المنشورات غير المسودة لن تتأثر." : "تبقى المنشورات وسجل نشرها محفوظة في الأرشيف.", danger: action === "delete_drafts", confirmLabel: "متابعة" })) return;
    bulk([...selected], action, value || null);
  }
  async function single(id: string, fn: () => Promise<unknown>, success: string) {
    try { await fn(); toast(success); router.refresh(); } catch (e) { toast(e instanceof Error ? e.message : "تعذر التنفيذ", "error"); }
  }
  const menuFor = (r: PostRow): MenuItem[] => [
    { label: "عرض", icon: "eye", onSelect: () => router.push(`/posts/${r.id}`) },
    ...(canWrite ? [
      ...(EDITABLE.includes(r.status) ? [{ label: "تعديل", icon: "edit", onSelect: () => router.push(`/posts/${r.id}/edit`) }] : []),
      { label: "تكرار", icon: "copy", onSelect: () => single(r.id, async () => { const c = await api<{ id: string }>(`/api/posts/${r.id}/duplicate`, { method: "POST" }); router.push(`/posts/${c.id}/edit`); }, "أُنشئت نسخة كمسودة") },
      "separator" as const,
      ...(["draft", "approved", "scheduled"].includes(r.status) ? [{ label: "نشر الآن", icon: "send", onSelect: async () => { if (await confirmDialog({ title: "نشر هذا المنشور الآن؟", message: "سيُنشر خلال دقيقة على صفحتك (إذا كان النشر الحقيقي مفعّلًا).", confirmLabel: "نشر الآن" })) single(r.id, () => api(`/api/posts/${r.id}/publish-now`, { method: "POST" }), "سيُنشر خلال دقيقة"); } }] : []),
      ...(r.status === "scheduled" ? [{ label: "إلغاء الجدولة", icon: "clock", onSelect: () => bulk([r.id], "unschedule") }] : []),
      { label: "نقل إلى حملة", icon: "campaign", onSelect: () => setMoveTarget(r.id) },
      { label: "أرشفة", icon: "archive", onSelect: () => bulk([r.id], "archive") },
      ...(r.status === "draft" ? ["separator" as const, { label: "حذف المسودة", icon: "trash", danger: true, onSelect: async () => { if (await confirmDialog({ title: "حذف المسودة؟", message: "تبقى في سلة المحذوفات 30 يومًا.", danger: true, confirmLabel: "حذف" })) bulk([r.id], "delete_drafts"); } }] : []),
    ] : []),
  ];

  return <>
    {canWrite && selected.size > 0 && <div className="bulk-bar" role="region" aria-label="إجراءات جماعية">
      <strong>{selected.size} محدد</strong>
      <select aria-label="الإجراء" value={action} onChange={(e) => { setAction(e.target.value); setValue(""); }}>{BULK.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {action === "change_page" && <select aria-label="الصفحة" value={value} onChange={(e) => setValue(e.target.value)}><option value="">اختر الصفحة</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      {action === "assign_campaign" && <select aria-label="الحملة" value={value} onChange={(e) => setValue(e.target.value)}><option value="">بدون حملة</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <button className="btn btn-primary btn-sm" disabled={busy || (action === "change_page" && !value)} onClick={runBulk}>{busy ? "جارٍ التنفيذ…" : "تنفيذ"}</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
    </div>}
    <div className="responsive-table"><table className="data-table posts-data">
      <thead><tr>{canWrite && <th><input type="checkbox" aria-label="تحديد الكل" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}<th>المحتوى</th><th>الصفحة</th><th>الحملة</th><th>موعد النشر</th><th>الحالة</th><th>آخر تحديث</th><th><span className="sr-only">الإجراءات</span></th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className={selected.has(r.id) ? "selected" : ""}>
        {canWrite && <td><input type="checkbox" aria-label="تحديد المنشور" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>}
        <td data-label="المحتوى"><div className="post-cell">{r.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb" src={r.image} alt="" loading="lazy" /> : <span className="thumb"><Icon name="posts" width={16} /></span>}<div style={{ minWidth: 0 }}><Link href={`/posts/${r.id}`} className="cell-content clamp-2">{r.content}</Link><span className="cell-meta">{[r.category, r.inQueue ? "في الطابور" : null].filter(Boolean).join(" · ")}{(r.category || r.inQueue) && r.tags.length > 0 && " · "}{r.tags.length > 0 && <>{r.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}</>}</span>{r.lastError && <span className="cell-error clamp-2">{r.lastError}</span>}</div></div></td>
        <td data-label="الصفحة" className="nowrap">{r.pageName ?? "—"}</td>
        <td data-label="الحملة">{r.campaignName ?? <span className="muted">—</span>}</td>
        <td data-label="الموعد" className="nowrap num">{riyadh(r.scheduledAt)}</td>
        <td data-label="الحالة"><StatusBadge status={r.status} /></td>
        <td data-label="التحديث" className="nowrap muted num">{riyadh(r.updatedAt)}</td>
        <td className="cell-actions"><RowMenu items={menuFor(r)} /></td>
      </tr>)}</tbody>
    </table></div>
    {moveTarget && <><div className="dialog-backdrop" onClick={() => setMoveTarget(null)} /><div className="dialog" role="dialog" aria-modal="true" aria-label="نقل إلى حملة"><h2>نقل إلى حملة</h2><select aria-label="الحملة" value={value} onChange={(e) => setValue(e.target.value)}><option value="">بدون حملة</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="form-actions"><button className="btn btn-primary" onClick={() => { bulk([moveTarget], "assign_campaign", value || null); setMoveTarget(null); setValue(""); }}>نقل</button><button className="btn btn-secondary" onClick={() => setMoveTarget(null)}>إلغاء</button></div></div></>}
  </>;
}

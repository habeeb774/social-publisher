"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, riyadh } from "../../ui/api";

type Row = { id: string; content: string; deletedAt: string; daysLeft: number };
export function TrashClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function act(id: string, action: "restore" | "purge") {
    if (action === "purge" && !confirm("حذف نهائي لا يمكن التراجع عنه. متابعة؟")) return;
    try { await api(`/api/posts/${id}/trash`, { method: "POST", body: { action } }); setMessage(action === "restore" ? "أُعيدت المسودة" : "حُذفت نهائيًا"); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر التنفيذ"); }
  }
  if (!rows.length) return <div className="card empty-state"><strong>سلة المحذوفات فارغة</strong><small>المسودات المحذوفة تبقى هنا 30 يومًا.</small></div>;
  return <>{message && <p className="banner" role="status">{message}</p>}
    <ul className="timeline-list panel-card">{rows.map((r) => <li key={r.id} className="row-between"><div><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.content.slice(0, 160)}{r.content.length > 160 ? "…" : ""}</p><small>حُذفت {riyadh(r.deletedAt)} · {r.daysLeft > 0 ? `تُحذف نهائيًا بعد ${r.daysLeft} يوم` : "تُحذف نهائيًا قريبًا"}</small></div>
      <span className="row-actions"><button className="btn btn-secondary" onClick={() => act(r.id, "restore")}>استرجاع</button><button className="link-button danger" onClick={() => act(r.id, "purge")}>حذف نهائي</button></span></li>)}</ul></>;
}

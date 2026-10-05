"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../ui/api";
import { toast } from "../ui/feedback";

export function ReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"changes" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "approve" | "changes" | "reject") {
    setBusy(true);
    try { await api(`/api/posts/${id}/approval`, { method: "POST", body: { action, reason } }); toast(action === "approve" ? "تمت الموافقة" : action === "changes" ? "طُلب التعديل" : "رُفض المنشور"); setMode(null); router.refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر التنفيذ", "error"); } finally { setBusy(false); }
  }
  return <div className="stack" style={{ gap: 6 }}>
    <div className="actions"><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("approve")}>موافقة</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setMode("changes")}>طلب تعديل</button><button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={() => setMode("reject")}>رفض</button></div>
    {mode && <div className="stack" style={{ gap: 6 }}><textarea aria-label="السبب" style={{ minHeight: 70 }} placeholder={mode === "changes" ? "ما المطلوب تعديله؟" : "سبب الرفض"} value={reason} onChange={(e) => setReason(e.target.value)} /><div className="actions"><button className="btn btn-primary btn-sm" disabled={busy || !reason.trim()} onClick={() => act(mode)}>إرسال</button><button className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>إلغاء</button></div></div>}
  </div>;
}

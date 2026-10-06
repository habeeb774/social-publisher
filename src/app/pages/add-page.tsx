"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "../ui/feedback";

/** Adds a Facebook page from its permanent page access token (pasted by the admin; stored encrypted on the server). */
export function AddPageButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await fetch("/api/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "تعذر إضافة الصفحة");
      toast(`أُضيفت صفحة ${d.name}${d.permanent ? "" : " — تنبيه: الرمز ليس دائمًا"}${d.canReply ? "" : " — بدون صلاحية الرد على التعليقات"}`);
      setOpen(false); setToken(""); router.refresh();
    } catch (err) { toast(err instanceof Error ? err.message : "تعذر إضافة الصفحة", "error"); } finally { setBusy(false); }
  }
  return <>
    <button className="btn btn-primary" onClick={() => setOpen(true)}>إضافة صفحة</button>
    {open && <><div className="dialog-backdrop" onClick={() => setOpen(false)} /><form className="dialog" role="dialog" aria-modal="true" aria-label="إضافة صفحة Facebook" onSubmit={save}>
      <h2>إضافة صفحة Facebook</h2>
      <p className="muted">الصق <b>رمز وصول الصفحة الدائم</b> (من Graph API Explorer عبر <code>me/accounts</code>). يُحفظ مشفرًا ولا يظهر مرة أخرى.</p>
      <input type="password" autoComplete="off" aria-label="رمز وصول الصفحة" placeholder="رمز وصول الصفحة" value={token} onChange={(e) => setToken(e.target.value)} />
      <div className="form-actions"><button className="btn btn-primary" disabled={busy || token.trim().length < 50}>{busy ? "جارٍ التحقق…" : "إضافة"}</button><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>إلغاء</button></div>
    </form></>}
  </>;
}

"use client";
// App-wide toasts and confirm dialogs, triggered from anywhere without context plumbing.
import { useEffect, useRef, useState } from "react";

type ToastType = "success" | "warning" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };
type ConfirmRequest = { title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };

export function toast(message: string, type: ToastType = "success") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sp:toast", { detail: { message, type } }));
}
/** Promise-based replacement for window.confirm with an accessible dialog. */
export function confirmDialog(options: Omit<ConfirmRequest, "resolve">) {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    window.dispatchEvent(new CustomEvent("sp:confirm", { detail: { ...options, resolve } }));
  });
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail as { message: string; type: ToastType };
      const id = ++seq;
      setToasts((t) => [...t.slice(-3), { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === "error" ? 7000 : 4000);
    };
    const onConfirm = (e: Event) => setConfirm((e as CustomEvent).detail as ConfirmRequest);
    window.addEventListener("sp:toast", onToast); window.addEventListener("sp:confirm", onConfirm);
    return () => { window.removeEventListener("sp:toast", onToast); window.removeEventListener("sp:confirm", onConfirm); };
  }, []);
  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);
  const close = (ok: boolean) => { confirm?.resolve(ok); setConfirm(null); };
  return <>
    <div className="toast-region" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}><span>{t.message}</span><button aria-label="إغلاق" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button></div>)}</div>
    {confirm && <>
      <div className="dialog-backdrop" onClick={() => close(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={(e) => { if (e.key === "Escape") close(false); }}>
        <h2 id="confirm-title">{confirm.title}</h2>
        {confirm.message && <p className="pre muted">{confirm.message}</p>}
        <div className="form-actions"><button ref={confirmButton} className={confirm.danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => close(true)}>{confirm.confirmLabel ?? "تأكيد"}</button><button className="btn btn-secondary" onClick={() => close(false)}>إلغاء</button></div>
      </div>
    </>}
  </>;
}

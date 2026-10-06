"use client";
import { useState } from "react";
import { Icon } from "../ui/icons";

/** Password input with show/hide and a Caps Lock hint. */
export function PasswordField({ id = "password", name = "password" }: { id?: string; name?: string }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const track = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return <label htmlFor={id}>كلمة المرور
    <span className="password-field">
      <input id={id} name={name} type={shown ? "text" : "password"} dir="ltr" placeholder="••••••••••" autoComplete="current-password" required maxLength={256} onKeyUp={track} onKeyDown={track} />
      <button type="button" className="reveal" aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={shown} onClick={() => setShown((v) => !v)}><Icon name="eye" width={18} />{shown && <span className="slash" aria-hidden="true" />}</button>
    </span>
    {caps && <small className="caps-hint">⇪ زر الأحرف الكبيرة (Caps Lock) مفعّل</small>}
  </label>;
}

/** Submit button that shows progress and blocks double submission (works with native form posts). */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return <button className="btn btn-primary btn-lg" type="submit" disabled={busy} aria-busy={busy}
    onClick={(e) => { const form = e.currentTarget.form; if (form?.checkValidity()) setTimeout(() => setBusy(true), 0); }}>
    {busy ? <><span className="spinner" aria-hidden="true" />جارٍ الدخول…</> : children}
  </button>;
}

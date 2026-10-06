"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "../../login/login-fields";

export function TeamLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const data = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/comments/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "تعذر الدخول");
      router.push("/inbox");
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الدخول"); setBusy(false); }
  }
  return <>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">البريد الإلكتروني<input id="email" name="email" type="email" dir="ltr" placeholder="name@company.com" autoComplete="username" required autoFocus /></label>
      <PasswordField />
      <button className="btn btn-primary btn-lg" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><span className="spinner" aria-hidden="true" />جارٍ الدخول…</> : "تسجيل الدخول"}</button>
    </form>
  </>;
}

import Link from "next/link";
import { LoginShell } from "./login-shell";
import { PasswordField, SubmitButton } from "./login-fields";

export const metadata = { title: "تسجيل الدخول" };

const ERRORS: Record<string, string> = {
  invalid: "البريد أو كلمة المرور غير صحيحة. تحقق منهما وحاول مرة أخرى.",
  config: "الدخول غير مُعد على الخادم بعد. تواصل مع مدير النظام.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginShell title="أهلًا بعودتك 👋" subtitle="سجّل الدخول لإدارة منشوراتك وتعليقاتك."
    footer={<><span>جلسة آمنة لمدة 8 ساعات. نسيت كلمة المرور؟ تواصل مع مدير المساحة.</span><Link href="/comments/login">دخول فريق التعليقات ←</Link></>}>
    {error && <div className="alert alert-danger" role="alert">{ERRORS[error] ?? ERRORS.invalid}</div>}
    <form method="post" action="/api/auth/login" className="login-form">
      <label htmlFor="email">البريد الإلكتروني<input id="email" name="email" type="email" dir="ltr" placeholder="name@company.com" autoComplete="email" required autoFocus /></label>
      <PasswordField />
      <SubmitButton>تسجيل الدخول</SubmitButton>
    </form>
  </LoginShell>;
}

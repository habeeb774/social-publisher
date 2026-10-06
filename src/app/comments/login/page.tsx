import Link from "next/link";
import { LoginShell } from "../../login/login-shell";
import { TeamLoginForm } from "./team-login-form";

export const metadata = { title: "دخول فريق التعليقات" };

export default function CommentLogin() {
  return <LoginShell title="دخول فريق التعليقات" subtitle="للحسابات التي أضافها مدير النظام للرد على التعليقات."
    footer={<><span>لا تملك حسابًا؟ اطلبه من مدير النظام.</span><Link href="/login">← الدخول الرئيسي</Link></>}>
    <TeamLoginForm />
  </LoginShell>;
}

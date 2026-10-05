import Image from "next/image";
import { Icon } from "../ui/icons";

export const metadata = { title: "تسجيل الدخول" };

const STORY = [
  { icon: "queue", title: "طابور ذكي", text: "كل منشور يأخذ أول وقت فارغ تلقائيًا", tag: "الخميس 20:00", warn: false },
  { icon: "send", title: "نشر موثوق", text: "فحص قبل النشر ومنع التكرار", tag: "تم النشر", warn: false },
  { icon: "inbox", title: "صندوق التعليقات", text: "كل التعليقات في مكان واحد مع مراجعة بشرية", tag: "بانتظار الرد", warn: true },
  { icon: "analytics", title: "تحليلات حقيقية", text: "أرقام من النظام وFacebook فقط، بلا تقديرات", tag: "مباشر", warn: false },
];

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-form-side">
      <div className="login-card">
        <div className="brand"><Image src="/brand/icon-192x192.png" alt="" width={36} height={36} priority /><div><strong>Social Publisher</strong><small>منصة النشر الذكي</small></div></div>
        <div><h1>تسجيل الدخول</h1><p className="muted" style={{ marginTop: 6 }}>أدخل بياناتك للوصول إلى مساحة العمل.</p></div>
        {error && <div className="alert alert-danger" role="alert">{error === "config" ? "بيانات الدخول غير مُعدة على الخادم." : "البريد أو كلمة المرور غير صحيحة."}</div>}
        <form method="post" action="/api/auth/login">
          <label htmlFor="email">البريد الإلكتروني<input id="email" name="email" type="email" dir="ltr" placeholder="name@company.com" autoComplete="email" required autoFocus /></label>
          <label htmlFor="password">كلمة المرور<input id="password" name="password" type="password" dir="ltr" placeholder="••••••••••" autoComplete="current-password" required /></label>
          <button className="btn btn-primary" type="submit">تسجيل الدخول</button>
        </form>
        <small>جلسة آمنة لمدة 8 ساعات. تواصل مع مدير المساحة إذا نسيت كلمة المرور.</small>
      </div>
    </section>
    <section className="login-brand" aria-hidden="true">
      <div><h2>خطّط، انشر، وتابع حضورك الاجتماعي من مكان واحد.</h2><p style={{ marginTop: 12 }}>نظام عربي لإدارة المحتوى والنشر والتفاعل لفرق التسويق.</p></div>
      <div className="story">{STORY.map((s) => <div key={s.title} className="story-row"><span className="icon"><Icon name={s.icon} /></span><div><b>{s.title}</b><small>{s.text}</small></div><span className={`tag ${s.warn ? "warn" : ""}`}>{s.tag}</span></div>)}</div>
    </section>
  </main>;
}

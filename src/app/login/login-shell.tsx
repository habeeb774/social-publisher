import Image from "next/image";
import { Icon } from "../ui/icons";

const STORY = [
  { icon: "calendar", title: "جدولة تلقائية", text: "منشوراتك تُنشر في موعدها بدون متابعة" },
  { icon: "inbox", title: "تعليقات ورسائل في مكان واحد", text: "رد يدوي أو تلقائي، وإخفاء السبام" },
  { icon: "analytics", title: "أفضل وقت للنشر", text: "اقتراحات من تفاعل جمهورك الفعلي" },
  { icon: "bell", title: "تنبيهات فورية", text: "على البريد وفي النظام عند أي مشكلة" },
];

/** Shared layout for the main and team login pages. */
export function LoginShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <main className="login-page">
    <section className="login-form-side">
      <div className="login-card">
        <div className="brand"><Image src="/brand/icon-192x192.png" alt="" width={40} height={40} priority /><div><strong>Social Publisher</strong><small>منصة النشر الذكي</small></div></div>
        <div className="login-heading"><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
        {footer && <div className="login-footer">{footer}</div>}
      </div>
    </section>
    <section className="login-brand" aria-hidden="true">
      <div className="login-brand-copy"><span className="eyebrow">ناشر المحتوى</span><h2>خطّط، انشر، وتفاعل مع جمهورك من مكان واحد.</h2><p>نظام عربي يدير صفحاتك على فيسبوك وانستجرام: الجدولة والنشر والتعليقات والرسائل والتقارير.</p></div>
      <ul className="story">{STORY.map((s) => <li key={s.title} className="story-row"><span className="icon"><Icon name={s.icon} /></span><div><b>{s.title}</b><small>{s.text}</small></div></li>)}</ul>
      <small className="login-brand-foot">🔒 اتصال مشفّر · جلسة آمنة · صلاحيات حسب الدور</small>
    </section>
  </main>;
}

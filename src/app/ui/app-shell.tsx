import Link from "next/link";

const links = [["⌂", "لوحة التحكم", "/dashboard"], ["▤", "المنشورات", "/posts"], ["◫", "التقويم", "/calendar"], ["◎", "صفحات Facebook", "/pages"], ["⇧", "استيراد Excel", "/import"], ["⚙", "الإعدادات", "/settings"]];

export function AppShell({ children, title, eyebrow }: { children: React.ReactNode; title: string; eyebrow?: string }) {
  return <div className="app-layout"><aside className="sidebar"><div className="app-brand"><div className="brand-mark">SP</div><div><strong>Social Publisher</strong><small>منصة النشر الذكي</small></div></div><nav className="side-nav">{links.map(([icon, label, href]) => <Link href={href} key={href}><span>{icon}</span>{label}</Link>)}</nav><div className="side-bottom"><div className="safe-mini"><span className="status-dot"/>وضع الاختبار مفعّل<small>لن يتم النشر الفعلي</small></div><form method="post" action="/api/auth/logout"><button className="logout" type="submit">↪ تسجيل الخروج</button></form></div></aside><main className="app-main"><header className="topbar"><div><p className="page-eyebrow">{eyebrow || "SOCIAL PUBLISHER"}</p><h1>{title}</h1></div><div className="user-chip"><span className="avatar">م</span><span>المشرف</span><span className="chevron">⌄</span></div></header>{children}</main></div>
}

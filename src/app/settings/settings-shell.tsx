import Link from "next/link";
import { AppShell } from "../ui/app-shell";
import { Icon } from "../ui/icons";

export const SETTINGS_SECTIONS: Array<{ href: string; label: string; icon: string; description: string }> = [
  { href: "/settings", label: "عام", icon: "settings", description: "اسم النظام والمنطقة الزمنية والقيم الافتراضية." },
  { href: "/settings/users", label: "الحساب والفريق", icon: "user", description: "المستخدمون والأدوار." },
  { href: "/settings/publishing", label: "النشر", icon: "send", description: "وضع النشر، الطابور، أوقات الإيقاف والأيام الهادئة." },
  { href: "/settings/integrations", label: "التكاملات", icon: "integrations", description: "Facebook والجدولة والتخزين والبريد." },
  { href: "/settings/notifications", label: "الإشعارات وسير العمل", icon: "bell", description: "قنوات التنبيه والموافقات." },
  { href: "/settings/comments", label: "التعليقات", icon: "inbox", description: "الردود والأتمتة وساعات العمل." },
  { href: "/settings/security", label: "الأمان", icon: "review", description: "الجلسات والصلاحيات." },
  { href: "/settings/appearance", label: "المظهر", icon: "sun", description: "الثيم وكثافة العرض." },
  { href: "/settings/export", label: "التصدير والنسخ", icon: "import", description: "CSV ونسخة احتياطية." },
];

/** Settings pages share an inner sidebar instead of one long form. */
export function SettingsShell({ active, title, description, actions, children }: { active: string; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return <AppShell title={title} parent={active === "/settings" ? undefined : { label: "الإعدادات", href: "/settings" }}>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="أقسام الإعدادات">{SETTINGS_SECTIONS.map((s) => <Link key={s.href} href={s.href} className={active === s.href ? "active" : ""} aria-current={active === s.href ? "page" : undefined}><Icon name={s.icon} />{s.label}</Link>)}</nav>
      <div className="settings-body">
        <div className="page-header" style={{ marginBottom: 0 }}><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>
        {children}
      </div>
    </div>
  </AppShell>;
}

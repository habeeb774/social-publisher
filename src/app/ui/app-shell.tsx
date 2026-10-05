"use client";
import { BrandLogo } from "./brand-logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Only finished features appear here (no half-built pages in production navigation).
const groups: Array<{ title: string; links: Array<[string, string, string]> }> = [
  { title: "المحتوى", links: [["⌂", "الرئيسية", "/dashboard"], ["▤", "المنشورات", "/posts"], ["☰", "الطابور", "/queue"], ["◷", "التقويم", "/calendar"], ["✦", "الحملات", "/campaigns"], ["◎", "الأهداف", "/goals"]] },
  { title: "المكتبة", links: [["▦", "الوسائط", "/media"], ["❏", "القوالب", "/templates"], ["❖", "المكتبة", "/library"], ["✎", "الأفكار", "/ideas"], ["↻", "إعادة الاستخدام", "/recycle"], ["⇧", "الاستيراد", "/import"]] },
  { title: "المتابعة", links: [["▲", "التحليلات", "/analytics"], ["!", "المنشورات الفاشلة", "/failed"], ["⌁", "السجلات", "/logs"], ["◉", "حالة النظام", "/status"]] },
  { title: "الإعداد", links: [["f", "صفحات Facebook", "/pages"], ["⚙", "الإعدادات", "/settings"]] },
];
const commands: Array<{ label: string; href: string; keys?: string }> = [
  { label: "منشور جديد", href: "/posts/new", keys: "N" },
  { label: "رفع / إضافة صورة", href: "/media" },
  { label: "إنشاء حملة", href: "/campaigns" },
  { label: "إضافة قالب", href: "/templates" },
  ...groups.flatMap((g) => g.links.map(([, label, href]) => ({ label: `فتح ${label}`, href }))),
  { label: "إعدادات الإشعارات", href: "/settings/notifications" },
  { label: "فكرة جديدة", href: "/ideas" },
  { label: "معالج الإعداد", href: "/onboarding" },
  { label: "قواعد النشر (أوقات وأيام الإيقاف)", href: "/settings/publishing" },
  { label: "التصدير والنسخ الاحتياطي", href: "/settings/export" },
];
type Result = { type: string; label: string; href: string };
type Alert = { id: string; title: string; message: string; isRead: boolean; createdAt: string };

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function AppShell({ children, title }: { children: React.ReactNode; title: string; eyebrow?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => typeof window !== "undefined" && window.localStorage.getItem("social-publisher-theme") === "dark" ? "dark" : "light");
  const [live, setLive] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<{ unread: number; items: Alert[] }>({ unread: 0, items: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteResults, setPaletteResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { const load = () => fetch("/api/notifications").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setAlerts(d); }).catch(() => {}); load(); const timer = setInterval(load, 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then((d) => setLive(Boolean(d.publishingEnabled))).catch(() => setLive(null)); }, []);
  // Debounced global search shared by the topbar box and the command palette.
  useEffect(() => { if (query.trim().length < 2) return; const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.json()).then((d) => setResults(d.results ?? [])).catch(() => {}), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { if (paletteQuery.trim().length < 2) return; const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(paletteQuery)}`).then((r) => r.json()).then((d) => setPaletteResults(d.results ?? [])).catch(() => {}), 250); return () => clearTimeout(t); }, [paletteQuery]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); setPaletteQuery(""); setActive(0); setTimeout(() => paletteRef.current?.focus(), 0); return; }
      if (e.key === "Escape") { setPalette(false); setCreateOpen(false); setNotificationsOpen(false); setOpen(false); setResults([]); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key.toLowerCase() === "n" || e.key === "ى") { e.preventDefault(); router.push("/posts/new"); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Stale results are hidden (not cleared) when the query is too short.
  const shownResults = query.trim().length >= 2 ? results : [];
  const shownPalette = paletteQuery.trim().length >= 2 ? paletteResults : [];
  function toggleTheme() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); window.localStorage.setItem("social-publisher-theme", next); }
  const paletteItems: Result[] = [...commands.filter((c) => !paletteQuery || c.label.includes(paletteQuery)).map((c) => ({ type: c.keys ? `اختصار ${c.keys}` : "أمر", label: c.label, href: c.href })), ...shownPalette];
  const go = (href: string) => { setPalette(false); setResults([]); setQuery(""); router.push(href); };
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return <div className="app-layout">
    <button className="mobile-menu" aria-label="فتح القائمة" onClick={() => setOpen(true)}>☰</button>
    {open && <button className="drawer-backdrop" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "drawer-open" : ""}`}>
      <div className="app-brand"><div><BrandLogo /><small>منصة النشر الذكي</small></div><button className="drawer-close" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>×</button></div>
      <nav className="side-nav" aria-label="التنقل الرئيسي">{groups.map((g) => <div key={g.title} className="nav-group"><small className="nav-title">{g.title}</small>{g.links.map(([icon, label, href]) => <Link onClick={() => setOpen(false)} className={isActive(href) ? "active" : ""} href={href} key={href}><span aria-hidden="true">{icon}</span>{label}</Link>)}</div>)}</nav>
      <div className="side-bottom"><div className="safe-mini"><span className="status-dot" />{live ? "النشر الحقيقي" : "وضع الاختبار"}<small>{live ? "المنشورات المجدولة تُنشر فعليًا" : live === null ? "جارٍ التحقق من الحالة" : "النشر الحقيقي متوقف"}</small></div><div className="profile-mini"><span className="avatar">م</span><div><strong>م. حبيب</strong><small>مشرف النظام</small></div><Link href="/settings" aria-label="إعدادات الحساب">⚙</Link></div><form method="post" action="/api/auth/logout"><button className="logout" type="submit">↪ تسجيل الخروج</button></form></div>
    </aside>
    <main className="app-main">
      <header className="topbar"><div className="crumbs"><span>Social Publisher</span><b>/</b><strong>{title}</strong></div>
        <div className="topbar-actions">
          <div className="create-wrap"><button className="top-create" aria-expanded={createOpen} onClick={() => setCreateOpen((v) => !v)}>＋ إنشاء</button>{createOpen && <div className="menu-panel" role="menu">{[["منشور جديد", "/posts/new"], ["رفع صورة", "/media"], ["إنشاء حملة", "/campaigns"], ["إضافة قالب", "/templates"]].map(([l, h]) => <Link role="menuitem" key={h} href={h} onClick={() => setCreateOpen(false)}>{l}</Link>)}</div>}</div>
          <div className="search-wrap"><label className="search-box"><span>⌕</span><input ref={searchRef} aria-label="بحث شامل" placeholder="بحث… ( / )" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && shownResults[0]) go(shownResults[0].href); }} /></label>
            {shownResults.length > 0 && <div className="search-results" role="listbox">{shownResults.map((r, i) => <button key={i} role="option" aria-selected={false} onClick={() => go(r.href)}><small>{r.type}</small>{r.label}</button>)}</div>}</div>
          <button className="top-icon kbd-hint" aria-label="لوحة الأوامر (Ctrl+K)" title="لوحة الأوامر (Ctrl+K)" onClick={() => { setPalette(true); setTimeout(() => paletteRef.current?.focus(), 0); }}>⌘K</button>
          <button className="theme-toggle" aria-label={theme === "dark" ? "تفعيل الثيم الفاتح" : "تفعيل الثيم الداكن"} onClick={toggleTheme}>{theme === "dark" ? "☀" : "☾"}</button>
          <div className="notification-wrap"><button className="top-icon" aria-label="الإشعارات" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((v) => !v); if (alerts.unread) fetch("/api/notifications", { method: "POST" }).then(() => setAlerts((a) => ({ ...a, unread: 0 }))).catch(() => {}); }}>♧{alerts.unread > 0 && <b className="notification-count">{alerts.unread}</b>}<i /></button>
            {notificationsOpen && <div className="notification-panel"><div className="row-between"><strong>الإشعارات</strong><Link href="/settings/notifications">الإعدادات</Link></div>{alerts.items.length ? alerts.items.map((item) => <div key={item.id} className="notification-item"><b className={item.isRead ? "" : "unread"}>{item.title}</b><small style={{ whiteSpace: "pre-wrap" }}>{item.message}</small><small className="muted">{new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>) : <><span>لا توجد إشعارات جديدة</span><small>تظهر هنا تنبيهات النشر والفشل والموافقات والجدولة.</small></>}</div>}</div>
          <span className="top-safe"><span className="status-dot" />{live ? "النشر الحقيقي مفعّل" : "وضع الاختبار"}</span>
        </div>
      </header>
      {children}
      <Link href="/posts/new" className="mobile-fab" aria-label="منشور جديد">＋</Link>
    </main>
    {palette && <div className="palette-backdrop" onClick={() => setPalette(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="لوحة الأوامر" onClick={(e) => e.stopPropagation()}>
      <input ref={paletteRef} aria-label="اكتب أمرًا أو ابحث" placeholder="اكتب أمرًا أو ابحث في المحتوى…" value={paletteQuery} onChange={(e) => { setPaletteQuery(e.target.value); setActive(0); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, paletteItems.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } else if (e.key === "Enter" && paletteItems[active]) go(paletteItems[active].href); }} />
      <div className="palette-list" role="listbox">{paletteItems.slice(0, 14).map((item, i) => <button key={`${item.href}-${i}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => go(item.href)}><span>{item.label}</span><small>{item.type}</small></button>)}{!paletteItems.length && <p>لا توجد نتائج</p>}</div>
      <small className="palette-help">↑↓ للتنقل · Enter للفتح · Esc للإغلاق · N منشور جديد · / بحث</small>
    </div></div>}
  </div>;
}

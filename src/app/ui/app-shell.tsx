"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { FeedbackHost } from "./feedback";
import { afterRender, setRootData, writePref } from "./client-prefs";

type NavLink = { icon: string; label: string; href: string; badge?: "inbox" | "failed" | "reviews" };
type NavGroup = { key: string; title: string; links: NavLink[] };

// Only finished features appear in navigation.
export const NAV: NavGroup[] = [
  { key: "home", title: "الرئيسية", links: [{ icon: "home", label: "لوحة التحكم", href: "/dashboard" }] },
  { key: "content", title: "المحتوى", links: [
    { icon: "posts", label: "المنشورات", href: "/posts" }, { icon: "queue", label: "الطابور", href: "/queue" }, { icon: "calendar", label: "التقويم", href: "/calendar" },
    { icon: "library", label: "المكتبة", href: "/library" }, { icon: "media", label: "الوسائط", href: "/media" }, { icon: "template", label: "القوالب", href: "/templates" }, { icon: "campaign", label: "الحملات", href: "/campaigns" },
  ] },
  { key: "engage", title: "التفاعل", links: [
    { icon: "inbox", label: "صندوق الوارد", href: "/inbox", badge: "inbox" }, { icon: "reply", label: "الردود الجاهزة", href: "/templates/replies" },
    { icon: "automation", label: "أتمتة التعليقات", href: "/automations/comments" }, { icon: "review", label: "مركز المراجعة", href: "/reviews", badge: "reviews" },
  ] },
  { key: "insights", title: "التحليلات", links: [
    { icon: "analytics", label: "التحليلات", href: "/analytics" }, { icon: "performance", label: "أداء المحتوى", href: "/performance" }, { icon: "goals", label: "الأهداف", href: "/goals" }, { icon: "report", label: "التقارير", href: "/reports" },
  ] },
  { key: "system", title: "النظام", links: [
    { icon: "pages", label: "صفحات Facebook", href: "/pages" }, { icon: "integrations", label: "التكاملات", href: "/settings/integrations" },
    { icon: "failed", label: "مركز الفشل", href: "/failed", badge: "failed" }, { icon: "logs", label: "السجلات", href: "/logs" }, { icon: "status", label: "حالة النظام", href: "/status" }, { icon: "settings", label: "الإعدادات", href: "/settings" },
  ] },
];
const ALL_LINKS = NAV.flatMap((g) => g.links);
const COMMANDS: Array<{ label: string; href: string; icon: string; keys?: string }> = [
  { label: "إنشاء منشور", href: "/posts/new", icon: "plus", keys: "N" },
  { label: "استيراد Excel / CSV", href: "/import", icon: "import" },
  { label: "إضافة صورة", href: "/media", icon: "media" },
  { label: "حملة جديدة", href: "/campaigns", icon: "campaign" },
  { label: "فكرة جديدة", href: "/library?kind=idea", icon: "ideas" },
  { label: "اختبار التكاملات (تشخيص)", href: "/status", icon: "status" },
  { label: "معالج الإعداد", href: "/onboarding", icon: "check" },
  { label: "قواعد النشر", href: "/settings/publishing", icon: "clock" },
  { label: "إعدادات الإشعارات", href: "/settings/notifications", icon: "bell" },
];
type Result = { type: string; label: string; href: string };
type Alert = { id: string; title: string; message: string; isRead: boolean; createdAt: string; type: string };
type Me = { name: string; email: string; role: string; roleLabel: string };
type Theme = "light" | "dark" | "system";
type PaletteItem = { group: string; label: string; href: string; icon: string; hint?: string };

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
const isActive = (pathname: string, href: string) => href === "/settings" ? pathname === "/settings" || (pathname.startsWith("/settings/") && !pathname.startsWith("/settings/integrations")) : pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
const readTheme = (): Theme => { try { const t = localStorage.getItem("sp-theme"); return t === "dark" || t === "light" || t === "system" ? t : "system"; } catch { return "system"; } };
const themeLabel = (t: Theme) => t === "light" ? "فاتح" : t === "dark" ? "داكن" : "حسب النظام";
const alertTone = (type: string) => /fail|invalid|gap|error/.test(type) ? "bad" : type === "published" || type === "approved" ? "ok" : "warn";

function Brand() {
  return <div className="app-brand"><Image src="/brand/icon-192x192.png" alt="" width={28} height={28} priority /><div><strong>Social Publisher</strong><small>منصة النشر الذكي</small></div></div>;
}

const COMMENT_PATHS = ["/inbox", "/settings/replies", "/templates/replies", "/automations/comments", "/analytics/comments"];
const COMMENT_NAV: NavGroup[] = [{ key: "comments", title: "إدارة التعليقات", links: NAV.flatMap((g) => g.links).filter((l) => COMMENT_PATHS.includes(l.href)) }];

function SideNav({ pathname, counts, onNavigate, commentsOnly = false }: { pathname: string; counts: Record<string, number>; onNavigate?: () => void; commentsOnly?: boolean }) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => afterRender(() => { try { setCollapsed(JSON.parse(localStorage.getItem("sp-nav-collapsed") ?? "[]")); } catch {} }), []);
  const toggle = (key: string) => setCollapsed((c) => { const next = c.includes(key) ? c.filter((k) => k !== key) : [...c, key]; try { localStorage.setItem("sp-nav-collapsed", JSON.stringify(next)); } catch {} return next; });
  return <nav className="side-nav" aria-label="التنقل الرئيسي">{(commentsOnly ? COMMENT_NAV : NAV).map((g) => {
    const hasActive = g.links.some((l) => isActive(pathname, l.href));
    const isCollapsed = collapsed.includes(g.key) && !hasActive;
    return <div key={g.key} className={`nav-group ${isCollapsed ? "collapsed" : ""}`}>
      {g.key !== "home" && <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(g.key)}>{g.title}<span className="chev">⌄</span></button>}
      <div className="nav-items">{g.links.map((l) => {
        const active = isActive(pathname, l.href);
        const count = l.badge ? counts[l.badge] ?? 0 : 0;
        return <Link key={l.href} href={l.href} onClick={onNavigate} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={l.icon} />{l.label}{count > 0 && <span className="count">{count > 99 ? "99+" : count}</span>}</Link>;
      })}</div>
    </div>;
  })}</nav>;
}

/** commentsOnly: comments-team members (separate login) see only the comment tools. */
export function AppShell({ children, title, parent, commentsOnly = false }: { children: React.ReactNode; title: string; eyebrow?: string; parent?: { label: string; href: string }; commentsOnly?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [live, setLive] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<{ unread: number; items: Alert[] }>({ unread: 0, items: [] });
  const [me, setMe] = useState<Me | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActiveIndex] = useState(0);
  const paletteRef = useRef<HTMLInputElement>(null);

  useEffect(() => afterRender(() => { const t = readTheme(); setTheme(t); setRootData("theme", t); }), []);
  useEffect(() => {
    if (commentsOnly) return;
    const load = () => fetch("/api/notifications").then((r) => r.ok ? r.json() : null).then((d) => { if (d) setAlerts(d); }).catch(() => {});
    load(); const timer = setInterval(load, 60000);
    fetch("/api/health").then((r) => r.json()).then((d) => setLive(Boolean(d.publishingEnabled))).catch(() => setLive(null));
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => { if (d) { setMe(d.user); setCounts(d.counts ?? {}); } }).catch(() => {});
    return () => clearInterval(timer);
  }, [commentsOnly]);
  useEffect(() => { if (query.trim().length < 2) return; const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.json()).then((d) => setResults(d.results ?? [])).catch(() => {}), 220); return () => clearTimeout(t); }, [query]);
  const openPalette = useCallback(() => { setPalette(true); setQuery(""); setActiveIndex(0); setTimeout(() => paletteRef.current?.focus(), 0); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
      if (e.key === "Escape") { setPalette(false); setNotificationsOpen(false); setProfileOpen(false); setDrawer(false); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); openPalette(); }
      else if (e.key.toLowerCase() === "n" || e.key === "ى") { e.preventDefault(); router.push("/posts/new"); }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [router, openPalette]);

  function cycleTheme() {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next); setRootData("theme", next); writePref("sp-theme", next);
  }
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const found = q.length >= 2 ? results.map((r) => ({ group: "نتائج البحث", label: r.label, href: r.href, icon: "search", hint: r.type })) : [];
    const commands = COMMANDS.filter((c) => !q || c.label.includes(q)).map((c) => ({ group: "إجراءات", label: c.label, href: c.href, icon: c.icon, hint: c.keys }));
    const pages = ALL_LINKS.filter((l) => !q || l.label.includes(q)).map((l) => ({ group: "انتقال", label: l.label, href: l.href, icon: l.icon }));
    return [...found, ...commands, ...pages].slice(0, 30);
  }, [query, results]);
  const go = (href: string) => { setPalette(false); router.push(href); };
  const crumbsParent = parent ?? (() => { const l = ALL_LINKS.find((x) => isActive(pathname, x.href)); return l && l.label !== title ? { label: l.label, href: l.href } : undefined; })();
  const grouped = items.map((item, i) => ({ item, i, header: i === 0 || items[i - 1].group !== item.group ? item.group : null }));

  return <div className="app-layout">
    <aside className="sidebar" aria-label="الشريط الجانبي">
      <Brand />
      <SideNav pathname={pathname} counts={counts} commentsOnly={commentsOnly} />
      <div className="side-bottom">
        <button className="profile-button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((v) => !v)}><span className="avatar">{(me?.name ?? "م").slice(0, 1)}</span><span className="grow"><strong>{me?.name ?? "…"}</strong><small>{me?.roleLabel ?? ""}</small></span><Icon name="more" width={16} /></button>
        {profileOpen && <div className="menu profile-menu" role="menu"><Link role="menuitem" href="/settings">الإعدادات</Link><Link role="menuitem" href="/settings/notifications">الإشعارات</Link><button role="menuitem" onClick={cycleTheme}>المظهر: {themeLabel(theme)}</button><div className="menu-sep" /><form method="post" action="/api/auth/logout"><button role="menuitem" className="menu-logout" type="submit"><Icon name="logout" width={16} /> تسجيل الخروج</button></form></div>}
      </div>
    </aside>

    <div className="app-main">
      <header className="topbar">
        <button className="top-icon mobile-menu" aria-label="فتح القائمة" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
        <nav className="crumbs" aria-label="مسار الصفحة">{crumbsParent && <><Link href={crumbsParent.href}>{crumbsParent.label}</Link><span className="sep">/</span></>}<strong>{title}</strong></nav>
        <div className="topbar-actions">
          <div className="search-wrap"><button className="search-trigger" onClick={openPalette} aria-label="بحث شامل (Ctrl+K)"><Icon name="search" width={16} />ابحث أو نفّذ أمرًا<kbd>Ctrl K</kbd></button></div>
          <button className="top-icon mobile-only" aria-label="بحث" onClick={openPalette}><Icon name="search" /></button>
          <Link className="btn btn-primary btn-sm top-create" href="/posts/new"><Icon name="plus" width={15} />منشور جديد</Link>
          <span className={`safe-indicator ${live ? "live" : "test"}`} tabIndex={0} data-tooltip={live ? "النشر الحقيقي مفعّل: المنشورات المجدولة تُنشر على صفحتك." : "النشر الحقيقي غير مفعّل: لا يُنشر أي محتوى فعليًا."}><i className="dot" /><span>{live === null ? "…" : live ? "النشر مفعّل" : "وضع الاختبار"}</span></span>
          <div className="notification-wrap">
            <button className="top-icon" aria-label={`الإشعارات${alerts.unread ? ` (${alerts.unread} غير مقروء)` : ""}`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((v) => !v); if (alerts.unread) fetch("/api/notifications", { method: "POST" }).then(() => setAlerts((a) => ({ ...a, unread: 0 }))).catch(() => {}); }}><Icon name="bell" />{alerts.unread > 0 && <b className="notification-count">{alerts.unread}</b>}</button>
            {notificationsOpen && <div className="notification-panel menu" role="dialog" aria-label="الإشعارات"><header>الإشعارات<Link href="/settings/notifications">الإعدادات</Link></header>
              {alerts.items.length ? alerts.items.map((item) => <div key={item.id} className="notification-item"><i className={`dot ${alertTone(item.type)}`} /><b className={item.isRead ? "" : "unread"}>{item.title}</b><small className="pre">{item.message.slice(0, 180)}</small><small className="muted">{new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>) : <div className="notification-empty">لا توجد إشعارات بعد.<br /><small>تظهر هنا تنبيهات النشر والفشل والموافقات والتعليقات.</small></div>}
            </div>}
          </div>
          <button className="theme-toggle kbd-only" onClick={cycleTheme} aria-label={`المظهر الحالي: ${themeLabel(theme)}`} data-tooltip={`المظهر: ${themeLabel(theme)}`}><Icon name={theme === "dark" ? "moon" : "sun"} /></button>
        </div>
      </header>
      <main className="app-content" id="content">{children}</main>
    </div>

    <nav className="bottom-nav" aria-label="التنقل السفلي">
      <Link href="/dashboard" className={isActive(pathname, "/dashboard") ? "active" : ""}><Icon name="home" />الرئيسية</Link>
      <Link href="/posts" className={isActive(pathname, "/posts") && pathname !== "/posts/new" ? "active" : ""}><Icon name="posts" />المنشورات</Link>
      <Link href="/posts/new" className="create" aria-label="إنشاء منشور"><span><Icon name="plus" /></span></Link>
      <Link href="/inbox" className={isActive(pathname, "/inbox") ? "active" : ""}><Icon name="inbox" />الوارد</Link>
      <button onClick={() => setDrawer(true)} aria-label="المزيد"><Icon name="more" />المزيد</button>
    </nav>

    {drawer && <><button className="drawer-backdrop" aria-label="إغلاق القائمة" onClick={() => setDrawer(false)} /><div className="drawer" role="dialog" aria-modal="true" aria-label="القائمة"><header><Brand /><button className="top-icon" aria-label="إغلاق" onClick={() => setDrawer(false)}><Icon name="close" /></button></header><SideNav pathname={pathname} counts={counts} onNavigate={() => setDrawer(false)} /><div className="side-bottom"><button className="btn btn-secondary block" onClick={cycleTheme}>المظهر: {themeLabel(theme)}</button><form method="post" action="/api/auth/logout"><button className="btn btn-ghost danger block" type="submit">تسجيل الخروج</button></form></div></div></>}

    {palette && <div className="palette-backdrop" onClick={() => setPalette(false)}><div className="palette" role="dialog" aria-modal="true" aria-label="لوحة الأوامر" onClick={(e) => e.stopPropagation()}>
      <input ref={paletteRef} role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="ابحث أو اكتب أمرًا" placeholder="ابحث في المنشورات والحملات والقوالب… أو اكتب أمرًا" value={query} onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((a) => Math.min(a + 1, items.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((a) => Math.max(a - 1, 0)); } else if (e.key === "Enter" && items[active]) go(items[active].href); }} />
      <div className="palette-list" id="palette-list" role="listbox">{grouped.map(({ item, i, header }) => <div key={`${item.href}-${i}`} style={{ display: "contents" }}>{header && <div className="palette-group">{header}</div>}<button role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActiveIndex(i)} onClick={() => go(item.href)}><Icon name={item.icon} width={16} /><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</button></div>)}{!items.length && <p>لا توجد نتائج</p>}</div>
      <div className="palette-help"><span><kbd>↑</kbd><kbd>↓</kbd> تنقل</span><span><kbd>Enter</kbd> فتح</span><span><kbd>Esc</kbd> إغلاق</span><span><kbd>N</kbd> منشور جديد</span></div>
    </div></div>}
    <FeedbackHost />
  </div>;
}

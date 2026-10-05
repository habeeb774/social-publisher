import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, posts } from "@/db/schema";
import { POST_CATEGORIES } from "@/services/catalog";
import { scheduleClusters } from "@/services/prepublish";
import { AppShell } from "../ui/app-shell";
import { STATUS_LABELS, riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { PageHeader } from "../ui/kit";
import { SavedFilters } from "../ui/saved-filters";
import { StatusBadge } from "../ui/status-badge";
import { CalendarGrid } from "./calendar-grid";
import { FilterToggle } from "../ui/filter-toggle";

export const dynamic = "force-dynamic";
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUSES = ["draft", "pending_approval", "approved", "scheduled", "published", "failed"] as const;
const VIEWS = { month: "شهر", week: "أسبوع", agenda: "قائمة" } as const;
type View = keyof typeof VIEWS;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000));

export default async function Calendar({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; month?: string; page?: string; status?: string; category?: string; campaign?: string }> }) {
  const params = await searchParams;
  const db = getDb();
  const today = String((await db.execute(sql`select to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD') as today`)).rows[0].today);
  const view: View = params.view && params.view in VIEWS ? params.view as View : "month";
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? `${params.month}-01` : today;
  const pageFilter = params.page && /^[0-9a-f-]{36}$/i.test(params.page) ? params.page : "";
  const campaignFilter = params.campaign && /^[0-9a-f-]{36}$/i.test(params.campaign) ? params.campaign : "";
  const statusFilter = STATUSES.includes(params.status as typeof STATUSES[number]) ? params.status as typeof STATUSES[number] : "";
  const categoryFilter = POST_CATEGORIES.includes(params.category as typeof POST_CATEGORIES[number]) ? params.category! : "";

  // Range per view (Riyadh dates). Weeks start on Sunday.
  const month = anchor.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const weekStart = addDays(anchor, -new Date(`${anchor}T00:00:00Z`).getUTCDay());
  const rangeStart = view === "month" ? `${month}-01` : view === "week" ? weekStart : anchor;
  const rangeEnd = view === "month" ? iso(new Date(Date.UTC(y, m, 1))) : view === "week" ? addDays(weekStart, 7) : addDays(anchor, 30);
  const from = new Date(`${rangeStart}T00:00:00+03:00`), to = new Date(`${rangeEnd}T00:00:00+03:00`);
  const prev = view === "month" ? iso(new Date(Date.UTC(y, m - 2, 1))) : addDays(view === "week" ? weekStart : anchor, view === "week" ? -7 : -30);
  const next = view === "month" ? iso(new Date(Date.UTC(y, m, 1))) : addDays(view === "week" ? weekStart : anchor, view === "week" ? 7 : 30);

  const [entries, pages, campaignList, clusters] = await Promise.all([
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt, page: facebookPages.name }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(isNull(posts.deletedAt), gte(posts.scheduledAt, from), lt(posts.scheduledAt, to), pageFilter ? eq(posts.pageId, pageFilter) : undefined, campaignFilter ? eq(posts.campaignId, campaignFilter) : undefined, statusFilter ? eq(posts.status, statusFilter) : undefined, categoryFilter ? eq(posts.category, categoryFilter) : undefined)).orderBy(asc(posts.scheduledAt)).limit(600),
    db.select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).limit(100),
    scheduleClusters(from, to),
  ]);
  const conflictIds = new Set(clusters.map((c) => c.id));
  const localDate = (d: Date) => iso(new Date(d.getTime() + 3 * 3600000));
  const itemsOn = (date: string) => entries.filter((e) => localDate(e.scheduledAt!) === date).map((e) => ({ id: e.id, content: e.content, status: e.status, scheduledAt: e.scheduledAt!.toISOString(), conflict: conflictIds.has(e.id) }));
  let cells: Array<{ day: number | null; date: string | null; items: ReturnType<typeof itemsOn>; label?: string }> = [];
  if (view === "month") {
    const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => { const day = i - offset + 1; if (day < 1 || day > daysInMonth) return { day: null, date: null, items: [] }; const date = `${month}-${String(day).padStart(2, "0")}`; return { day, date, items: itemsOn(date) }; });
  } else if (view === "week") {
    cells = Array.from({ length: 7 }, (_, i) => { const date = addDays(weekStart, i); return { day: Number(date.slice(8)), date, label: `${DAYS[i]} ${Number(date.slice(8))}`, items: itemsOn(date) }; });
  }
  const agendaDays = view === "agenda" ? Array.from(new Set(entries.map((e) => localDate(e.scheduledAt!)))) : [];
  const title = view === "month" ? new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" }) : view === "week" ? `${weekStart} ← ${addDays(weekStart, 6)}` : `من ${anchor} لمدة 30 يومًا`;
  const filters = { page: pageFilter, campaign: campaignFilter, status: statusFilter, category: categoryFilter };
  const keep = (extra: Record<string, string>) => `/calendar?${new URLSearchParams(Object.entries({ view, date: anchor, ...filters, ...extra }).filter(([k, v]) => v && !(k === "view" && v === "month")))}`;
  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  return <AppShell title="التقويم">
    <PageHeader title="التقويم" description="المواعيد بتوقيت الرياض. اسحب منشورًا لنقله ليوم آخر؛ المنشورات المنشورة لا تُنقل." actions={<Link className="btn btn-primary" href="/posts/new"><Icon name="plus" width={16} />جدولة منشور</Link>} />
    <div className="calendar-toolbar">
      <div className="segmented" role="tablist" aria-label="طريقة العرض">{(Object.keys(VIEWS) as View[]).map((v) => <Link key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} href={keep({ view: v })}>{VIEWS[v]}</Link>)}</div>
      <Link className="btn btn-icon" aria-label="السابق" href={keep({ date: prev })}>›</Link>
      <strong>{title}</strong>
      <Link className="btn btn-icon" aria-label="التالي" href={keep({ date: next })}>‹</Link>
      <Link className="btn btn-ghost btn-sm" href={keep({ date: today })}>اليوم</Link>
      {clusters.length > 0 && <span className="badge badge-warning">{clusters.length} منشور متقارب خلال 5 دقائق</span>}
    </div>
    <form className="toolbar" method="get"><input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
      <FilterToggle active={Object.values(filters).filter(Boolean).length}>
      <select name="page" aria-label="الصفحة" defaultValue={pageFilter}><option value="">كل الصفحات</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select name="campaign" aria-label="الحملة" defaultValue={campaignFilter}><option value="">كل الحملات</option>{campaignList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select name="status" aria-label="الحالة" defaultValue={statusFilter}><option value="">كل الحالات</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
      <select name="category" aria-label="التصنيف" defaultValue={categoryFilter}><option value="">كل التصنيفات</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </FilterToggle>
      <button className="btn btn-secondary">تطبيق</button>{filterQuery && <Link className="btn btn-ghost" href={keep({ page: "", campaign: "", status: "", category: "" })}>مسح</Link>}
    </form>
    <SavedFilters scope="calendar" basePath="/calendar" query={filterQuery} />
    {view === "agenda" ? <section className="card card-flush">{agendaDays.length ? <div className="agenda">{agendaDays.map((d) => <div key={d} className="agenda-day"><b>{new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))}</b><ul>{entries.filter((e) => localDate(e.scheduledAt!) === d).map((e) => <li key={e.id} className="row-between"><Link href={`/posts/${e.id}`} className="grow clamp-2" style={{ color: "var(--heading)" }}>{conflictIds.has(e.id) && "⚠ "}{e.content}</Link><span className="row nowrap"><small className="num">{riyadh(e.scheduledAt, "time")}</small><StatusBadge status={e.status} /></span></li>)}</ul></div>)}</div> : <EmptyState icon="calendar" title="لا توجد منشورات خلال هذه الفترة" />}</section>
      : <CalendarGrid days={DAYS} cells={cells} today={today} variant={view} />}
  </AppShell>;
}

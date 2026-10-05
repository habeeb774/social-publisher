import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { POST_CATEGORIES } from "@/services/catalog";
import { scheduleClusters } from "@/services/prepublish";
import { AppShell } from "../ui/app-shell";
import { STATUS_LABELS } from "../ui/api";
import { CalendarGrid } from "./calendar-grid";

export const dynamic = "force-dynamic";
const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUSES = ["draft", "pending_approval", "approved", "scheduled", "published", "failed"] as const;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ month?: string; page?: string; status?: string; category?: string }> }) {
  const params = await searchParams;
  const db = getDb();
  const todayResult = await db.execute(sql`select to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD') as today`);
  const today = String(todayResult.rows[0].today);
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) && Number(params.month.slice(0, 4)) >= 2000 && Number(params.month.slice(0, 4)) <= 2100 ? params.month : today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const adjacent = (offset: number) => new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
  const next = adjacent(1);
  const pageFilter = params.page && /^[0-9a-f-]{36}$/i.test(params.page) ? params.page : "";
  const statusFilter = STATUSES.includes(params.status as typeof STATUSES[number]) ? params.status as typeof STATUSES[number] : "";
  const categoryFilter = POST_CATEGORIES.includes(params.category as typeof POST_CATEGORIES[number]) ? params.category! : "";
  const from = new Date(`${month}-01T00:00:00+03:00`), to = new Date(`${next}-01T00:00:00+03:00`);
  const [entries, pages, clusters] = await Promise.all([
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt }).from(posts).where(and(isNull(posts.deletedAt), gte(posts.scheduledAt, from), lt(posts.scheduledAt, to), pageFilter ? eq(posts.pageId, pageFilter) : undefined, statusFilter ? eq(posts.status, statusFilter) : undefined, categoryFilter ? eq(posts.category, categoryFilter) : undefined)).orderBy(asc(posts.scheduledAt)).limit(500),
    db.select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages),
    scheduleClusters(from, to),
  ]);
  const conflictIds = new Set(clusters.map((c) => c.id));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = monthDate.getUTCDay();
  const cellsCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellsCount }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > daysInMonth) return { day: null, date: null, items: [] };
    const date = `${month}-${String(day).padStart(2, "0")}`;
    return { day, date, items: entries.filter((item) => new Date(item.scheduledAt!.getTime() + 3 * 3600000).toISOString().slice(0, 10) === date).map((item) => ({ id: item.id, content: item.content, status: item.status, scheduledAt: item.scheduledAt!.toISOString(), conflict: conflictIds.has(item.id) })) };
  });
  const keep = (extra: Record<string, string>) => `/calendar?${new URLSearchParams(Object.fromEntries(Object.entries({ month, page: pageFilter, status: statusFilter, category: categoryFilter, ...extra }).filter(([, v]) => v)))}`;
  return <AppShell title="التقويم">
    <div className="calendar-toolbar"><Link className="icon-button" aria-label="الشهر السابق" href={keep({ month: adjacent(-1) })}>‹</Link><strong>{monthDate.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><Link className="icon-button" aria-label="الشهر التالي" href={keep({ month: next })}>›</Link><Link href="/calendar">الشهر الحالي</Link><Link className="primary-button" href="/posts/new">جدولة منشور</Link></div>
    <form className="inline-field calendar-filters" method="get"><input type="hidden" name="month" value={month} />
      <select name="page" aria-label="الصفحة" defaultValue={pageFilter}><option value="">كل الصفحات</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select name="status" aria-label="الحالة" defaultValue={statusFilter}><option value="">كل الحالات</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
      <select name="category" aria-label="التصنيف" defaultValue={categoryFilter}><option value="">كل التصنيفات</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <button className="secondary-button">تطبيق</button>{(pageFilter || statusFilter || categoryFilter) && <Link href={`/calendar?month=${month}`}>مسح الفلاتر</Link>}
    </form>
    <p>المواعيد بتوقيت الرياض. اسحب منشورًا مجدولًا ليوم آخر لنقله (يُطلب تأكيد، والمنشورات المنشورة لا تُنقل).{clusters.length > 0 && <strong> ⚠ يوجد {clusters.length} منشور متقارب خلال 5 دقائق هذا الشهر.</strong>}</p>
    <CalendarGrid days={days} cells={cells} today={today} />
    {!entries.length && <p className="panel-card">لا توجد منشورات تطابق الفلاتر في هذا الشهر.</p>}
  </AppShell>;
}

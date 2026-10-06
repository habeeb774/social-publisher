import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, postMedia, posts } from "@/db/schema";
import { POST_CATEGORIES } from "@/services/catalog";
import { pageCan } from "@/services/session-server";
import { listMetaAccounts } from "@/services/meta-accounts";
import { AppShell } from "../ui/app-shell";
import { STATUS_LABELS } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { PageHeader } from "../ui/kit";
import { SavedFilters } from "../ui/saved-filters";
import { PostsTable } from "./posts-table";
import { FilterToggle } from "../ui/filter-toggle";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;
const TABS = ["all", "draft", "pending_approval", "scheduled", "publishing", "published", "failed", "cancelled", "archived"] as const;
const SORTS = { updated: "آخر تحديث", scheduled: "موعد النشر", created: "تاريخ الإنشاء" } as const;
type Params = { status?: string; q?: string; account?: string; page?: string; campaign?: string; category?: string; from?: string; to?: string; sort?: string; p?: string };
const uuid = (v?: string) => v && /^[0-9a-f-]{36}$/i.test(v) ? v : "";
const day = (v?: string) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";

export default async function Posts({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = TABS.includes(params.status as typeof TABS[number]) ? params.status as typeof TABS[number] : "all";
  const q = (params.q ?? "").trim().slice(0, 100);
  const pageId = uuid(params.page), campaignId = uuid(params.campaign);
  const category = POST_CATEGORIES.includes(params.category as typeof POST_CATEGORIES[number]) ? params.category! : "";
  const from = day(params.from), to = day(params.to);
  const sort = params.sort && params.sort in SORTS ? params.sort as keyof typeof SORTS : "updated";
  const p = Math.max(1, Number(params.p) || 1);
  const db = getDb();
  const metaAccounts = await listMetaAccounts();
  const requestedAccount = (params.account ?? "").trim().slice(0, 200);
  const account = metaAccounts.find((item) => item.id === requestedAccount)?.id ?? "";
  const accountRemoteIds = account
    ? metaAccounts.find((item) => item.id === account)?.pageIds.concat(metaAccounts.find((item) => item.id === account)?.instagramIds ?? []) ?? []
    : [];
  const accountLocalPages = account && accountRemoteIds.length
    ? await db.select({ id: facebookPages.id }).from(facebookPages).where(inArray(facebookPages.facebookPageId, accountRemoteIds))
    : [];
  const filters: SQL[] = [isNull(posts.deletedAt)];
  if (account) filters.push(accountLocalPages.length ? inArray(posts.pageId, accountLocalPages.map((item) => item.id)) : sql`false`);
  if (q) filters.push(sql`(${ilike(posts.content, `%${q.replace(/[%_\\]/g, "")}%`)} or ${posts.id}::text like ${`${q.replace(/[%_\\]/g, "")}%`})`);
  if (pageId) filters.push(eq(posts.pageId, pageId));
  if (campaignId) filters.push(eq(posts.campaignId, campaignId));
  if (category) filters.push(eq(posts.category, category));
  if (from) filters.push(gte(posts.scheduledAt, new Date(`${from}T00:00:00+03:00`)));
  if (to) filters.push(lt(posts.scheduledAt, new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86400000)));
  const base = and(...filters);
  const where = and(base, status === "all" ? sql`${posts.status} <> 'archived'` : eq(posts.status, status));
  const order = sort === "scheduled" ? [sql`${posts.scheduledAt} asc nulls last`] : sort === "created" ? [desc(posts.createdAt)] : [desc(posts.updatedAt)];
  const [rows, counts, pageList, campaignList, canWrite] = await Promise.all([
    db.select({ post: posts, pageName: facebookPages.name, campaignName: campaigns.name, image: sql<string | null>`(select ${postMedia.url} from ${postMedia} where ${postMedia.postId} = ${posts.id} limit 1)` }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(where).orderBy(...order).limit(PAGE_SIZE + 1).offset((p - 1) * PAGE_SIZE),
    db.select({ status: posts.status, n: sql<number>`count(*)::int` }).from(posts).where(base).groupBy(posts.status),
    db.select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages).where(eq(facebookPages.isActive, true)),
    db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).orderBy(desc(campaigns.createdAt)).limit(100),
    pageCan("content.write"),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);
  const countOf = (s: string) => s === "all" ? counts.filter((c) => c.status !== "archived").reduce((a, c) => a + c.n, 0) : counts.find((c) => c.status === s)?.n ?? 0;
  const keep = (extra: Record<string, string | number>) => `/posts?${new URLSearchParams(Object.entries({ status, q, account, page: pageId, campaign: campaignId, category, from, to, sort, ...extra }).filter(([k, v]) => v && !(k === "status" && v === "all") && !(k === "sort" && v === "updated") && !(k === "p" && String(v) === "1")).map(([k, v]) => [k, String(v)]))}`;
  const filterQuery = new URLSearchParams(Object.entries({ status: status === "all" ? "" : status, account, page: pageId, campaign: campaignId, category }).filter(([, v]) => v)).toString();
  const filtered = Boolean(q || account || pageId || campaignId || category || from || to);

  return <AppShell title="المنشورات">
    <PageHeader title="المنشورات" description="إدارة وجدولة وتتبع جميع المنشورات." actions={<><Link className="btn btn-secondary" href="/import"><Icon name="import" width={16} />استيراد</Link>{canWrite && <Link className="btn btn-primary" href="/posts/new"><Icon name="plus" width={16} />منشور جديد</Link>}</>} />
    <nav className="tabs" aria-label="حالة المنشور">{TABS.map((t) => <Link key={t} href={keep({ status: t, p: 1 })} className={status === t ? "active" : ""} aria-current={status === t ? "page" : undefined}>{t === "all" ? "الكل" : STATUS_LABELS[t]} <b>{countOf(t)}</b></Link>)}</nav>
    <form className="toolbar" method="get" role="search">
      {status !== "all" && <input type="hidden" name="status" value={status} />}
      <input name="q" type="search" defaultValue={q} placeholder="ابحث في النص أو رقم المنشور…" aria-label="بحث" />
      <FilterToggle active={[account, pageId, campaignId, category, from, to].filter(Boolean).length}>
      {metaAccounts.length > 1 && <select name="account" defaultValue={account} aria-label="حساب Meta"><option value="">كل حسابات Meta</option>{metaAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      <select name="page" defaultValue={pageId} aria-label="الصفحة"><option value="">كل الصفحات</option>{pageList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select name="campaign" defaultValue={campaignId} aria-label="الحملة"><option value="">كل الحملات</option>{campaignList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select name="category" defaultValue={category} aria-label="التصنيف"><option value="">كل التصنيفات</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <input name="from" type="date" defaultValue={from} aria-label="من تاريخ" style={{ width: 150 }} />
      <input name="to" type="date" defaultValue={to} aria-label="إلى تاريخ" style={{ width: 150 }} />
      <select name="sort" defaultValue={sort} aria-label="الترتيب">{Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>ترتيب: {l}</option>)}</select>
      </FilterToggle>
      <button className="btn btn-secondary">تطبيق</button>
      {filtered && <Link className="btn btn-ghost" href={status === "all" ? "/posts" : `/posts?status=${status}`}>مسح</Link>}
    </form>
    <SavedFilters scope="posts" basePath="/posts" query={filterQuery} />
    <section className="card card-flush">
      {visible.length ? <PostsTable canWrite={canWrite} pages={pageList} campaigns={campaignList} rows={visible.map(({ post, pageName, campaignName, image }) => ({ id: post.id, content: post.content, status: post.status, scheduledAt: post.scheduledAt?.toISOString() ?? null, updatedAt: post.updatedAt.toISOString(), lastError: post.lastError, pageName, campaignName, category: post.category, tags: post.tags, inQueue: post.inQueue, image }))} />
        : <EmptyState title={filtered ? "لا توجد نتائج مطابقة" : status === "all" ? "لا توجد منشورات بعد" : `لا توجد منشورات «${STATUS_LABELS[status]}»`} description={filtered ? "جرّب تغيير الفلاتر أو البحث." : "ابدأ بإنشاء منشور أو استيراد ملف."} action={canWrite && !filtered ? <Link className="btn btn-primary btn-sm" href="/posts/new">إنشاء منشور</Link> : undefined} />}
    </section>
    {(p > 1 || hasMore) && <nav className="pagination" aria-label="الصفحات">{p > 1 && <Link className="btn btn-secondary btn-sm" href={keep({ p: p - 1 })}>السابق</Link>}<span>صفحة {p}</span>{hasMore && <Link className="btn btn-secondary btn-sm" href={keep({ p: p + 1 })}>التالي</Link>}</nav>}
    <div className="row" style={{ justifyContent: "center", marginTop: 8 }}><Link href="/posts/archive" className="btn btn-ghost btn-sm"><Icon name="archive" width={15} />الأرشيف</Link><Link href="/posts/trash" className="btn btn-ghost btn-sm"><Icon name="trash" width={15} />سلة المحذوفات</Link></div>
  </AppShell>;
}

import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, posts } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { EmptyState } from "../ui/empty-state";
import { STATUS_LABELS } from "../ui/api";
import { PostsTable } from "./posts-table";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const FILTERS = ["all", "draft", "pending_approval", "scheduled", "published", "failed", "archived"] as const;

export default async function Posts({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const status = FILTERS.includes(params.status as typeof FILTERS[number]) ? params.status as typeof FILTERS[number] : "all";
  const page = Math.max(1, Number(params.page) || 1);
  const db = getDb();
  // Archived posts live on /posts/archive; the default list hides them.
  const where = and(isNull(posts.deletedAt), status === "all" ? sql`${posts.status} <> 'archived'` : eq(posts.status, status));
  let failed = false;
  let rows: Array<{ post: typeof posts.$inferSelect; pageName: string | null; campaignName: string | null }> = [];
  let counts: Array<{ status: string; n: number }> = [];
  let pageList: Array<{ id: string; name: string }> = [];
  let campaignList: Array<{ id: string; name: string }> = [];
  try {
    [rows, counts, pageList, campaignList] = await Promise.all([
      db.select({ post: posts, pageName: facebookPages.name, campaignName: campaigns.name }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(where).orderBy(desc(posts.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE),
      db.select({ status: posts.status, n: sql<number>`count(*)::int` }).from(posts).where(isNull(posts.deletedAt)).groupBy(posts.status),
      db.select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages).where(eq(facebookPages.isActive, true)),
      db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).orderBy(desc(campaigns.createdAt)).limit(100),
    ]);
  } catch { failed = true; }
  const hasMore = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);
  const total = counts.filter((c) => c.status !== "archived").reduce((s, c) => s + c.n, 0);
  const countOf = (s: string) => s === "all" ? total : counts.find((c) => c.status === s)?.n ?? 0;
  const href = (s: string, p = 1) => `/posts?${new URLSearchParams({ ...(s !== "all" ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  return <AppShell title="المنشورات">
    <div className="page-intro"><div><h2>كل محتواك في مكان واحد</h2><p>إدارة المحتوى المجدول والمنشور والمسودات · {total} منشور</p></div><div className="intro-actions"><Link className="secondary-button" href="/posts/archive">الأرشيف</Link><Link className="primary-button" href="/posts/new">＋ منشور جديد</Link></div></div>
    <nav className="status-tabs" aria-label="حالة المنشور">{FILTERS.filter((f) => f !== "archived").map((f) => <Link key={f} href={href(f)} className={status === f ? "active" : ""} aria-current={status === f ? "page" : undefined}>{f === "all" ? "الكل" : STATUS_LABELS[f]} <b>{countOf(f)}</b></Link>)}</nav>
    <div className="panel-card table-card posts-table">
      {failed ? <div role="alert" className="banner">تعذر تحميل المنشورات من قاعدة البيانات. أعد تحميل الصفحة للمحاولة.</div>
        : visible.length ? <PostsTable pages={pageList} campaigns={campaignList} rows={visible.map(({ post, pageName, campaignName }) => ({ id: post.id, content: post.content, status: post.status, scheduledAt: post.scheduledAt?.toISOString() ?? null, lastError: post.lastError, pageName, campaignName, category: post.category, tags: post.tags, inQueue: post.inQueue }))} />
        : <EmptyState title={status === "all" ? "لا توجد منشورات بعد" : `لا توجد منشورات في حالة «${STATUS_LABELS[status]}»`} description="ابدأ بإنشاء منشور وجدولته." action={<Link className="primary-button" href="/posts/new">إنشاء منشور</Link>} />}
    </div>
    {(page > 1 || hasMore) && <nav className="pagination" aria-label="الصفحات">{page > 1 && <Link className="secondary-button" href={href(status, page - 1)}>السابق</Link>}<span>صفحة {page}</span>{hasMore && <Link className="secondary-button" href={href(status, page + 1)}>التالي</Link>}</nav>}
  </AppShell>;
}

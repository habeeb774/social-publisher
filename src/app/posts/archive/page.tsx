import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, posts } from "@/db/schema";
import { AppShell } from "../../ui/app-shell";
import { EmptyState } from "../../ui/empty-state";
import { PostsTable } from "../posts-table";

export const dynamic = "force-dynamic";
/** Archived posts. Publication history is preserved; nothing here is deleted. */
export default async function Archive({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const db = getDb();
  const rows = await db.select({ post: posts, pageName: facebookPages.name, campaignName: campaigns.name }).from(posts).leftJoin(facebookPages, eq(posts.pageId, facebookPages.id)).leftJoin(campaigns, eq(posts.campaignId, campaigns.id)).where(and(eq(posts.status, "archived"), isNull(posts.deletedAt))).orderBy(desc(posts.updatedAt)).limit(51).offset((page - 1) * 50);
  return <AppShell title="الأرشيف">
    <div className="page-intro"><div><h2>الأرشيف</h2><p>المحتوى القديم مع الاحتفاظ بسجل النشر الكامل.</p></div><Link className="btn btn-secondary" href="/posts">العودة للمنشورات</Link></div>
    <div className="card table-card">{rows.length ? <PostsTable pages={[]} campaigns={[]} rows={rows.slice(0, 50).map(({ post, pageName, campaignName }) => ({ id: post.id, content: post.content, status: post.status, scheduledAt: post.scheduledAt?.toISOString() ?? null, lastError: null, updatedAt: post.updatedAt.toISOString(), image: null, pageName, campaignName, category: post.category, tags: post.tags, inQueue: false }))} /> : <EmptyState title="الأرشيف فارغ" description="المنشورات المؤرشفة تظهر هنا." />}</div>
    {(page > 1 || rows.length > 50) && <nav className="pagination">{page > 1 && <Link className="btn btn-secondary" href={`/posts/archive?page=${page - 1}`}>السابق</Link>}<span>صفحة {page}</span>{rows.length > 50 && <Link className="btn btn-secondary" href={`/posts/archive?page=${page + 1}`}>التالي</Link>}</nav>}
  </AppShell>;
}

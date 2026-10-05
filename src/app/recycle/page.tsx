import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { engagementOf, getPostPerformance } from "@/services/post-insights";
import { AppShell } from "../ui/app-shell";
import { RecycleButton } from "./recycle-button";

export const dynamic = "force-dynamic";
const MIN_AGE_DAYS = 14;
const cutoff = () => new Date(Date.now() - MIN_AGE_DAYS * 86400000);

/** Older published posts ranked by real engagement when Facebook provides it. Reuse never publishes automatically. */
export default async function Recycle() {
  const rows = await getDb().select({ id: posts.id, content: posts.content, publishedAt: posts.publishedAt, fbId: posts.facebookPostId, pageFbId: facebookPages.facebookPageId }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(eq(posts.status, "published"), isNull(posts.deletedAt), lt(posts.publishedAt, cutoff()))).orderBy(desc(posts.publishedAt)).limit(25);
  const withPerf = await Promise.all(rows.map(async (r) => ({ ...r, perf: r.fbId ? await getPostPerformance(r.fbId, r.pageFbId) : null })));
  const hasData = withPerf.some((r) => r.perf?.available);
  const ranked = hasData ? [...withPerf].sort((a, b) => (b.perf?.available ? engagementOf(b.perf) : -1) - (a.perf?.available ? engagementOf(a.perf) : -1)) : withPerf;
  return <AppShell title="إعادة استخدام المحتوى">
    <div className="page-intro"><div><h2>إعادة استخدام المحتوى</h2><p>منشورات نُشرت قبل أكثر من {MIN_AGE_DAYS} يومًا{hasData ? "، مرتبة حسب التفاعل الفعلي على Facebook" : ""}. «إعادة استخدام» تنشئ مسودة جديدة فقط.</p></div></div>
    {!ranked.length ? <div className="panel-card empty-state"><strong>لا توجد منشورات قديمة بعد</strong><small>تظهر هنا المنشورات بعد {MIN_AGE_DAYS} يومًا من نشرها.</small></div> :
      <div className="card-grid">{ranked.map((r) => <article key={r.id} className="panel-card"><p style={{ whiteSpace: "pre-wrap" }}>{r.content.slice(0, 220)}{r.content.length > 220 ? "…" : ""}</p>
        <small>نُشر {r.publishedAt?.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}{r.perf?.available ? ` · تفاعل ${engagementOf(r.perf)}` : " · لا توجد بيانات تفاعل"}</small>
        <RecycleButton id={r.id} /></article>)}</div>}
  </AppShell>;
}

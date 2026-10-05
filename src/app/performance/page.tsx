import Link from "next/link";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { engagementOf, getPostPerformance } from "@/services/post-insights";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { PageHeader } from "../ui/kit";
import { RecycleButton } from "./recycle-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "أداء المحتوى" };
const DAYS = 60;
const since = () => new Date(Date.now() - DAYS * 86400000);
const metric = (m: Array<{ key: string; value: number }>, key: string) => m.find((x) => x.key === key)?.value;

/** Published posts with real Facebook metrics (only fields Facebook returns), ranked by engagement, with reuse. */
export default async function Performance() {
  const [rows, canWrite] = await Promise.all([
    getDb().select({ id: posts.id, content: posts.content, publishedAt: posts.publishedAt, fbId: posts.facebookPostId, pageFbId: facebookPages.facebookPageId, page: facebookPages.name }).from(posts).innerJoin(facebookPages, eq(posts.pageId, facebookPages.id)).where(and(eq(posts.status, "published"), isNotNull(posts.facebookPostId), isNull(posts.deletedAt), gte(posts.publishedAt, since()))).orderBy(desc(posts.publishedAt)).limit(30),
    pageCan("content.write"),
  ]);
  const withPerf = await Promise.all(rows.map(async (r) => ({ ...r, perf: await getPostPerformance(r.fbId!, r.pageFbId) })));
  const available = withPerf.some((r) => r.perf.available);
  const ranked = [...withPerf].sort((a, b) => (b.perf.available ? engagementOf(b.perf) : -1) - (a.perf.available ? engagementOf(a.perf) : -1));
  const reason = withPerf.find((r) => !r.perf.available)?.perf.reason;
  return <AppShell title="أداء المحتوى">
    <PageHeader title="أداء المحتوى" description={`المنشورات المنشورة خلال آخر ${DAYS} يومًا مرتبة حسب التفاعل الفعلي على Facebook. «إعادة استخدام» تنشئ مسودة جديدة ولا تنشر شيئًا.`} actions={<Link className="btn btn-secondary" href="/analytics">التحليلات</Link>} />
    {!available && rows.length > 0 && <div className="alert alert-info">لا تتوفر بيانات أداء من Facebook بعد{reason ? ` (${reason})` : ""}. الأعمدة تظهر فارغة حتى يتفاعل الجمهور.</div>}
    <section className="card card-flush">{!ranked.length ? <EmptyState icon="performance" title="لا توجد منشورات منشورة خلال الفترة" /> :
      <div className="responsive-table"><table className="data-table"><thead><tr><th>#</th><th>المنشور</th><th>نُشر</th><th>الوصول</th><th>التفاعلات</th><th>التعليقات</th><th>المشاركات</th><th>المجموع</th><th><span className="sr-only">إجراء</span></th></tr></thead>
        <tbody>{ranked.map((r, i) => <tr key={r.id}><td className="num muted">{i + 1}</td><td data-label="المحتوى" style={{ minWidth: 280 }}><Link href={`/posts/${r.id}`} className="cell-content clamp-2">{r.content}</Link><span className="cell-meta">{r.page}</span></td><td data-label="نُشر" className="nowrap num">{riyadh(r.publishedAt)}</td>
          {["post_impressions_unique", "reactions", "comments", "shares"].map((k) => <td key={k} data-label={k} className="num">{r.perf.available ? (metric(r.perf.metrics, k) ?? "—").toLocaleString("ar-SA") : "—"}</td>)}
          <td className="num" style={{ fontWeight: 600 }}>{r.perf.available ? engagementOf(r.perf).toLocaleString("ar-SA") : "—"}</td>
          <td>{canWrite && <RecycleButton id={r.id} />}</td></tr>)}</tbody></table></div>}
    </section>
    <small style={{ display: "block", marginTop: 8 }}>المصدر: Facebook Graph API. تُعرض فقط الحقول التي يرجعها Facebook فعلًا، وتُحدّث كل 30 دقيقة.</small>
  </AppShell>;
}

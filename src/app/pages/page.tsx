import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { isGraphConfigured } from "@/services/facebook-graph";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { PageHeader } from "../ui/kit";
import { TestConnectionButton } from "../settings/integrations/test-connection";
import { LinkInstagramButton } from "./link-instagram";

export const dynamic = "force-dynamic";
export const metadata = { title: "صفحات Facebook" };

/** Connected pages as compact connection rows, with real per-page activity. */
export default async function Pages() {
  const db = getDb();
  const [rows, canDiagnose] = await Promise.all([
    db.select({
      page: facebookPages,
      published: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'published')`,
      scheduled: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'scheduled' and p.deleted_at is null)`,
      lastPublish: sql<string | null>`(select max(published_at) from posts p where p.page_id = ${facebookPages.id})`,
      lastFailure: sql<string | null>`(select max(failed_at) from posts p where p.page_id = ${facebookPages.id})`,
    }).from(facebookPages).orderBy(asc(facebookPages.createdAt)),
    pageCan("system.diagnose"),
  ]);
  const graph = isGraphConfigured(), windsor = Boolean(process.env.WINDSOR_API_KEY);
  return <AppShell title="صفحات Facebook">
    <PageHeader title="الصفحات والحسابات" description="صفحات Facebook وحسابات Instagram المتصلة. لا تُعرض أي رموز وصول." actions={canDiagnose ? <><LinkInstagramButton /><TestConnectionButton /></> : undefined} />
    <section className="card card-flush">{!rows.length ? <EmptyState icon="pages" title="لا توجد صفحات متصلة" description="اربط صفحة عبر Windsor أو أضف توكن الصفحة في Vercel." action={<Link className="btn btn-secondary btn-sm" href="/settings/integrations">التكاملات</Link>} /> :
      rows.map(({ page, published, scheduled, lastPublish, lastFailure }) => {
        const state = !page.isActive ? "disabled" : graph || windsor ? (lastFailure && (!lastPublish || lastFailure > lastPublish) ? "error" : "connected") : "auth";
        const badge = { connected: ["badge-success", "متصل"], error: ["badge-danger", "خطأ في آخر نشر"], auth: ["badge-warning", "يحتاج تفويض"], disabled: ["badge-neutral", "معطّل"] }[state];
        return <div key={page.id} className="integration">
          <span className="logo" style={{ background: "var(--primary)", color: "#fff", fontWeight: 700 }}>{page.name.replace(/^م\.\s*/, "").slice(0, 1)}</span>
          <div><h3>{page.name}</h3><small><code>{page.facebookPageId}</code> · {graph ? "Meta Graph API" : "Windsor MCP"} · {page.mcpConnectionReference ?? "facebook_organic"}</small>
            <div className="caps"><span className={`cap ${graph || windsor ? "on" : "off"}`}>✓ نشر نص</span><span className={`cap ${graph || windsor ? "on" : "off"}`}>✓ نشر صورة</span><span className={`cap ${windsor ? "on" : "off"}`}>{windsor ? "✓" : "—"} قراءة التعليقات</span><span className="cap off">— الرد على التعليقات</span></div>
            <div className="caps"><span className="cap">منشور: {published}</span><span className="cap">مجدول: {scheduled}</span><span className="cap">آخر نشر: {riyadh(lastPublish)}</span><span className="cap">آخر فحص: {riyadh(page.lastConnectionCheck ?? page.updatedAt)}</span></div></div>
          <div className="stack" style={{ gap: 6, justifyItems: "end" }}><span className={`badge ${badge[0]}`}>{badge[1]}</span><Link className="btn btn-ghost btn-sm" href={`/posts?page=${page.id}`}><Icon name="posts" width={14} />المنشورات</Link></div>
        </div>;
      })}
    </section>
  </AppShell>;
}

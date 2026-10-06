import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { isGraphConfigured } from "@/services/facebook-graph";
import { metaOAuthConfigured } from "@/services/meta-oauth";
import { pageCan } from "@/services/session-server";
import { getSetting } from "@/services/settings-store";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { PageHeader } from "../ui/kit";
import { TestConnectionButton } from "../settings/integrations/test-connection";
import { LinkInstagramButton } from "./link-instagram";
import { AddPageButton } from "./add-page";
import { ConnectMetaButton } from "./connect-meta";

export const dynamic = "force-dynamic";
export const metadata = { title: "صفحات Facebook" };

/** Connected pages as compact connection rows, with real per-page activity. */
export default async function Pages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const db = getDb();
  const [rows, canDiagnose, canManage, metaProfile] = await Promise.all([
    db.select({
      page: facebookPages,
      published: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'published')`,
      scheduled: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'scheduled' and p.deleted_at is null)`,
      lastPublish: sql<string | null>`(select max(published_at) from posts p where p.page_id = ${facebookPages.id})`,
      lastFailure: sql<string | null>`(select max(failed_at) from posts p where p.page_id = ${facebookPages.id})`,
    }).from(facebookPages).orderBy(asc(facebookPages.createdAt)),
    pageCan("system.diagnose"),
    pageCan("settings.manage"),
    getSetting<{ id: string; name: string; pictureUrl?: string | null; connectedAt?: string } | null>("meta_connected_profile", null),
  ]);
  const graph = isGraphConfigured(), windsor = Boolean(process.env.WINDSOR_API_KEY), oauthReady = metaOAuthConfigured();
  const metaState = typeof params.meta === "string" ? params.meta : null;
  const metaMessage = metaState === "connected"
    ? `تم ربط Meta بنجاح · الملف الشخصي: ${params.profile === "1" ? "متصل" : "غير متاح"} · صفحات: ${typeof params.pages === "string" ? params.pages : "0"} · Instagram: ${typeof params.instagram === "string" ? params.instagram : "0"} · Messenger: ${params.messenger === "1" ? "مفعّل" : "يحتاج صلاحية pages_messaging"}`
    : metaState === "missing-config" ? "الربط التلقائي جاهز، ويحتاج فقط META_APP_ID و META_APP_SECRET في Vercel."
    : metaState === "no-pages" ? "تم تسجيل الدخول إلى Meta، لكن لم نجد صفحة تديرها بهذه الصلاحيات."
    : metaState === "cancelled" ? "أُلغي ربط Meta قبل إكمال التفويض."
    : metaState === "invalid-state" ? "تعذر التحقق من جلسة الربط. أعد المحاولة."
    : metaState === "failed" ? "تعذر إكمال ربط Meta. راجع إعدادات التطبيق والصلاحيات ثم أعد المحاولة."
    : null;
  return <AppShell title="صفحات Facebook">
    <PageHeader title="الصفحات والحسابات" description="مركز اتصال Facebook وInstagram. التوكنات تُحفظ مشفّرة ولا تظهر في الواجهة." actions={<>{canManage && <><ConnectMetaButton configured={oauthReady} /><AddPageButton /><LinkInstagramButton /></>}{canDiagnose && <TestConnectionButton />}</>} />
    {metaMessage && <div className={`banner ${metaState === "connected" ? "success" : metaState === "missing-config" ? "" : "warning"}`}>{metaMessage}</div>}
    {metaProfile && <section className="card card-flush" style={{ marginBottom: 16 }}>
      <div className="integration">
        {metaProfile.pictureUrl
          ? <img src={metaProfile.pictureUrl} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
          : <span className="logo" style={{ background: "var(--surface-2)", fontWeight: 700 }}>{metaProfile.name.slice(0, 1)}</span>}
        <div>
          <h3>{metaProfile.name}</h3>
          <small><code>{metaProfile.id}</code> · ملف Meta الشخصي · هوية الحساب الذي تم الربط منه</small>
          <div className="caps">
            <span className="cap on">✓ متصل</span>
            <span className="cap">إدارة الصفحات والحسابات المرتبطة</span>
            <span className="cap off">— لا نشر آلي</span>
            <span className="cap off">— لا قراءة تعليقات</span>
            <span className="cap off">— لا رد يدوي أو تلقائي عبر API</span>
          </div>
          <small>الملف الشخصي يظهر للهوية والربط فقط. إدارة التعليقات والردود داخل Social Publisher متاحة لصفحات Facebook المدعومة.</small>
        </div>
        <div className="stack" style={{ gap: 6, justifyItems: "end" }}>
          <span className="badge badge-neutral">عرض فقط</span>
          <a className="btn btn-ghost btn-sm" href={`https://www.facebook.com/${metaProfile.id}`} target="_blank" rel="noreferrer">
            <Icon name="facebook" width={14} />فتح الملف الشخصي في Facebook
          </a>
          {metaProfile.connectedAt && <small>آخر ربط: {riyadh(metaProfile.connectedAt)}</small>}
        </div>
      </div>
    </section>}
    <section className="card card-flush">{!rows.length ? <EmptyState icon="pages" title="لا توجد صفحات متصلة" description={oauthReady ? "اربط حساب Meta مرة واحدة ليتم استيراد صفحات Facebook وInstagram تلقائيًا." : "الربط اليدوي يعمل الآن. لتفعيل OAuth أضف META_APP_ID و META_APP_SECRET في Vercel."} action={<Link className="btn btn-secondary btn-sm" href="/settings/integrations">التكاملات</Link>} /> :
      rows.map(({ page, published, scheduled, lastPublish, lastFailure }) => {
        const hasPageToken = Boolean(page.accessTokenEnc);
        const usable = hasPageToken || graph || windsor;
        const state = !page.isActive ? "disabled" : usable ? (lastFailure && (!lastPublish || lastFailure > lastPublish) ? "error" : "connected") : "auth";
        const badge = { connected: ["badge-success", "متصل"], error: ["badge-danger", "خطأ في آخر نشر"], auth: ["badge-warning", "يحتاج تفويض"], disabled: ["badge-neutral", "معطّل"] }[state];
        return <div key={page.id} className="integration">
          <span className="logo" style={{ background: "var(--primary)", color: "#fff", fontWeight: 700 }}>{page.name.replace(/^م\.\s*/, "").slice(0, 1)}</span>
          <div><h3>{page.name}</h3><small><code>{page.facebookPageId}</code> · {page.platform === "instagram" ? "Instagram" : "Facebook"} · {hasPageToken ? "توكن مشفّر خاص بالحساب" : graph ? "Meta Graph API (احتياطي)" : "Windsor MCP"}</small>
            <div className="caps"><span className={`cap ${usable ? "on" : "off"}`}>✓ نشر نص</span><span className={`cap ${usable ? "on" : "off"}`}>✓ نشر صورة</span><span className={`cap ${hasPageToken || windsor ? "on" : "off"}`}>{hasPageToken || windsor ? "✓" : "—"} قراءة التفاعل</span><span className={`cap ${hasPageToken ? "on" : "off"}`}>{hasPageToken ? "✓" : "—"} توكن الحساب</span></div>
            <div className="caps"><span className="cap">منشور: {published}</span><span className="cap">مجدول: {scheduled}</span><span className="cap">آخر نشر: {riyadh(lastPublish)}</span><span className="cap">آخر فحص: {riyadh(page.lastConnectionCheck ?? page.updatedAt)}</span></div></div>
          <div className="stack" style={{ gap: 6, justifyItems: "end" }}><span className={`badge ${badge[0]}`}>{badge[1]}</span><Link className="btn btn-ghost btn-sm" href={`/posts?page=${page.id}`}><Icon name="posts" width={14} />المنشورات</Link></div>
        </div>;
      })}
    </section>
  </AppShell>;
}

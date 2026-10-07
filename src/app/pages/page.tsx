import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { isGraphConfigured } from "@/services/facebook-graph";
import { metaOAuthConfigured } from "@/services/meta-oauth";
import { pageCan, pageSession } from "@/services/session-server";
import { allowedPageIds } from "@/services/access-scope";
import { listMetaAccounts } from "@/services/meta-accounts";
import { messengerPageConnected } from "@/services/messenger-connection";
import { AppShell } from "../ui/app-shell";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icons";
import { PageHeader } from "../ui/kit";
import { TestConnectionButton } from "../settings/integrations/test-connection";
import { LinkInstagramButton } from "./link-instagram";
import { AddPageButton } from "./add-page";
import { ConnectMetaButton } from "./connect-meta";
import { MetaAccountActions } from "./meta-account-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "صفحات Facebook" };

/** Connected pages as compact connection rows, with real per-page activity. */
export default async function Pages({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const db = getDb();
  const [allRows, canDiagnose, canManage, metaAccounts, session] = await Promise.all([
    db.select({
      page: facebookPages,
      published: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'published')`,
      scheduled: sql<number>`(select count(*)::int from posts p where p.page_id = ${facebookPages.id} and p.status = 'scheduled' and p.deleted_at is null)`,
      lastPublish: sql<string | null>`(select max(published_at) from posts p where p.page_id = ${facebookPages.id})`,
      lastFailure: sql<string | null>`(select max(failed_at) from posts p where p.page_id = ${facebookPages.id})`,
    }).from(facebookPages).orderBy(asc(facebookPages.createdAt)),
    pageCan("system.diagnose"),
    pageCan("settings.manage"),
    listMetaAccounts(),
    pageSession(),
  ]);
  const allowed = session ? await allowedPageIds({ id: session.userId, role: session.role }) : new Set<string>();
  const rows = allowed === null ? allRows : allRows.filter(({ page }) => allowed.has(page.id));
  const messengerPages = new Set((await Promise.all(rows.filter(({ page }) => page.platform === "facebook").map(async ({ page }) =>
    await messengerPageConnected(page.facebookPageId) ? page.facebookPageId : null
  ))).filter((id): id is string => id !== null));
  const visibleMetaAccounts = allowed === null ? metaAccounts : metaAccounts.filter((account) => rows.some(({ page }) => account.pageIds.includes(page.facebookPageId) || account.instagramIds.includes(page.facebookPageId)));
  const graph = isGraphConfigured(), windsor = Boolean(process.env.WINDSOR_API_KEY), oauthReady = metaOAuthConfigured();
  const metaState = typeof params.meta === "string" ? params.meta : null;
  const metaMessage = metaState === "connected"
    ? `تم ربط Meta بنجاح · الملف الشخصي: ${params.profile === "1" ? "متصل" : "غير متاح"} · صفحات: ${typeof params.pages === "string" ? params.pages : "0"} · Instagram: ${typeof params.instagram === "string" ? params.instagram : "0"} · Messenger: ${params.messenger === "1" ? "مفعّل" : "يحتاج صلاحية pages_messaging"}`
    : metaState === "messenger-connected" ? `تم تفعيل Messenger والاشتراك في أحداث الرسائل لـ ${params.pages} صفحة. أرسل رسالة اختبار للتحقق من الاستقبال.`
    : metaState === "messenger-partial" ? `تم تفعيل Messenger لـ ${params.pages} صفحة؛ تعذر الاشتراك لبعض الصفحات. أعد التفعيل لهذه الصفحات.`
    : metaState === "messenger-permission-missing" ? "لم يمنح Meta صلاحيات Messenger المطلوبة. فعّل Messenger في تطبيق Meta وأكمل مراجعة الصلاحيات ثم أعد المحاولة."
    : metaState === "messenger-cancelled" ? "أُلغي تفعيل Messenger."
    : metaState === "messenger-failed" ? "تعذر تفعيل Messenger. تأكد من تفعيل المنتج والصلاحيات وربط الصفحة أولًا."
    : metaState === "missing-config" ? "الربط التلقائي جاهز، ويحتاج فقط META_APP_ID و META_APP_SECRET في Vercel."
    : metaState === "no-pages" ? "تم تسجيل الدخول إلى Meta، لكن لم نجد صفحة تديرها بهذه الصلاحيات."
    : metaState === "cancelled" ? "أُلغي ربط Meta قبل إكمال التفويض."
    : metaState === "invalid-state" ? "تعذر التحقق من جلسة الربط. أعد المحاولة."
    : metaState === "failed" ? "تعذر إكمال ربط Meta. راجع إعدادات التطبيق والصلاحيات ثم أعد المحاولة."
    : null;
  return <AppShell title="صفحات Facebook">
    <PageHeader title="الصفحات والحسابات" description="اربط أكثر من حساب Meta وأدر صفحات Facebook وInstagram لكل حساب. التوكنات تُحفظ مشفّرة ولا تظهر في الواجهة." actions={<>{canManage && <><ConnectMetaButton configured={oauthReady} /><AddPageButton /><LinkInstagramButton /></>}{canDiagnose && <TestConnectionButton />}</>} />
    {metaMessage && <div className={`banner ${metaState === "connected" ? "success" : metaState === "missing-config" ? "" : "warning"}`}>{metaMessage}</div>}
    {canManage && <section className="card" style={{ marginBottom: 16 }}>
      <h2>تفعيل Messenger</h2>
      <p>تفويض مستقل للرسائل بعد ربط الصفحة. يحتاج تفعيل Messenger وصلاحياته في تطبيق Meta، وإعداد Webhook لاستقبال الأحداث.</p>
      {oauthReady && <a className="btn btn-secondary" href="/api/meta/oauth/start?purpose=messenger">تفعيل أو إعادة ربط Messenger</a>}
      <Link className="btn btn-ghost" href="/inbox/messages">فتح الرسائل</Link>
    </section>}
    {visibleMetaAccounts.length > 0 && <section className="card card-flush" style={{ marginBottom: 16 }}>
      {visibleMetaAccounts.map((account) => {
        const linkedPages = rows.filter(({ page }) =>
          account.pageIds.includes(page.facebookPageId) || account.instagramIds.includes(page.facebookPageId)
        );
        const messenger = account.pageIds.some((id) => messengerPages.has(id));
        const active = account.status === "active";
        return <div key={account.id} className="integration">
          {account.pictureUrl
            ? <img src={account.pictureUrl} alt="" width={48} height={48} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
            : <span className="logo" style={{ background: "var(--surface-2)", fontWeight: 700 }}>{account.name.slice(0, 1)}</span>}
          <div>
            <h3>{account.name}</h3>
            <small><code>{account.id}</code> · حساب Meta متصل · هوية إدارة فقط</small>
            <div className="caps">
              <span className={`cap ${active ? "on" : "off"}`}>{active ? "✓" : "—"} {active ? "متصل" : account.status === "needs_reauth" ? "يحتاج إعادة ربط" : "غير متصل"}</span>
              <span className="cap">{account.pageIds.length} صفحة Facebook</span>
              <span className="cap">{account.instagramIds.length} Instagram</span>
              <span className={`cap ${messenger ? "on" : "off"}`}>{messenger ? "✓" : "—"} Messenger</span>
              <span className="cap off">— لا نشر للملف الشخصي</span>
            </div>
            <small>{linkedPages.length
              ? `مرتبط حاليًا بـ ${linkedPages.length} قناة داخل النظام.`
              : "أعد ربط هذا الحساب مرة واحدة لتحديث ربط صفحاته بالقائمة متعددة الحسابات."}</small>
          </div>
          <div className="stack" style={{ gap: 6, justifyItems: "end" }}>
            <span className={`badge ${active ? "badge-success" : "badge-warning"}`}>{active ? "حساب Meta" : "إعادة ربط مطلوبة"}</span>
            {canManage && <MetaAccountActions accountId={account.id} active={active} />}
            <a className="btn btn-ghost btn-sm" href={`https://www.facebook.com/${account.id}`} target="_blank" rel="noreferrer">
              <Icon name="facebook" width={14} />فتح الحساب
            </a>
            <small>آخر ربط: {riyadh(account.lastConnectedAt)}</small>
          </div>
        </div>;
      })}
    </section>}
    <section className="card card-flush">{!rows.length ? <EmptyState icon="pages" title="لا توجد صفحات متصلة" description={oauthReady ? "اربط حساب Meta مرة واحدة ليتم استيراد صفحات Facebook وInstagram تلقائيًا." : "الربط اليدوي يعمل الآن. لتفعيل OAuth أضف META_APP_ID و META_APP_SECRET في Vercel."} action={<Link className="btn btn-secondary btn-sm" href="/settings/integrations">التكاملات</Link>} /> :
      rows.map(({ page, published, scheduled, lastPublish, lastFailure }) => {
        const accountOwners = visibleMetaAccounts.filter((account) =>
          page.platform === "instagram" ? account.instagramIds.includes(page.facebookPageId) : account.pageIds.includes(page.facebookPageId)
        );
        const ownerLabel = accountOwners.length ? accountOwners.map((account) => account.name).join("، ") : null;
        const hasPageToken = Boolean(page.accessTokenEnc);
        const usable = hasPageToken || graph || windsor;
        const state = !page.isActive ? "disabled" : usable ? (lastFailure && (!lastPublish || lastFailure > lastPublish) ? "error" : "connected") : "auth";
        const badge = { connected: ["badge-success", "متصل"], error: ["badge-danger", "خطأ في آخر نشر"], auth: ["badge-warning", "يحتاج تفويض"], disabled: ["badge-neutral", "معطّل"] }[state];
        return <div key={page.id} className="integration">
          <span className="logo" style={{ background: "var(--primary)", color: "#fff", fontWeight: 700 }}>{page.name.replace(/^م\.\s*/, "").slice(0, 1)}</span>
          <div><h3>{page.name}</h3><small><code>{page.facebookPageId}</code> · {page.platform === "instagram" ? "Instagram" : "Facebook"} · {ownerLabel ? `حساب Meta: ${ownerLabel}` : "غير مصنفة تحت حساب بعد"} · {hasPageToken ? "توكن مشفّر" : graph ? "Meta Graph API (احتياطي)" : "Windsor MCP"}</small>
            <div className="caps"><span className={`cap ${usable ? "on" : "off"}`}>✓ نشر نص</span><span className={`cap ${usable ? "on" : "off"}`}>✓ نشر صورة</span><span className={`cap ${hasPageToken || windsor ? "on" : "off"}`}>{hasPageToken || windsor ? "✓" : "—"} قراءة التفاعل</span><span className={`cap ${hasPageToken ? "on" : "off"}`}>{hasPageToken ? "✓" : "—"} توكن الحساب</span></div>
            <div className="caps"><span className="cap">منشور: {published}</span><span className="cap">مجدول: {scheduled}</span><span className="cap">آخر نشر: {riyadh(lastPublish)}</span><span className="cap">آخر فحص: {riyadh(page.lastConnectionCheck ?? page.updatedAt)}</span></div></div>
          <div className="stack" style={{ gap: 6, justifyItems: "end" }}><span className={`badge ${badge[0]}`}>{badge[1]}</span><Link className="btn btn-ghost btn-sm" href={`/posts?page=${page.id}`}><Icon name="posts" width={14} />المنشورات</Link></div>
        </div>;
      })}
    </section>
  </AppShell>;
}

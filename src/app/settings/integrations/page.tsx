import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { schedulerRuns } from "@/db/schema";
import { commentsProvider } from "@/services/comments/provider";
import { flags } from "@/services/comments/rules";
import { isGraphConfigured } from "@/services/facebook-graph";
import { metaOAuthConfigured } from "@/services/meta-oauth";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { storageProvider } from "@/services/storage";
import { testWindsorMcp } from "@/services/windsor-mcp";
import { riyadh } from "../../ui/api";
import { Icon } from "../../ui/icons";
import { SettingsShell } from "../settings-shell";
import { TestConnectionButton } from "./test-connection";
import { MetaWebhookSetup } from "./meta-webhook-setup";
import { messengerStatus } from "@/services/messenger";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "التكاملات" };
const withTimeout = <T,>(p: Promise<T>, ms = 8000) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const Cap = ({ on, label }: { on: boolean | null; label: string }) => <span className={`cap ${on ? "on" : "off"}`}>{on ? "✓" : "—"} {label}</span>;
const minutesSince = (d: Date | undefined) => d ? (Date.now() - d.getTime()) / 60000 : Infinity;
const Status = ({ state, text }: { state: "ok" | "warn" | "bad" | "off"; text: string }) => <span className={`badge ${state === "ok" ? "badge-success" : state === "warn" ? "badge-warning" : state === "bad" ? "badge-danger" : "badge-neutral"}`}>{text}</span>;

/** Each integration with provider, status, last check and real capabilities (discovered, never assumed). */
export default async function Integrations() {
  const checkedAt = new Date();
  const [mcp, comments, runs, messenger] = await Promise.all([
    process.env.WINDSOR_API_KEY ? withTimeout(testWindsorMcp().catch(() => null)) : Promise.resolve(null),
    withTimeout(commentsProvider.capabilities().catch(() => null)),
    getDb().select({ at: schedulerRuns.triggeredAt, status: schedulerRuns.status, error: schedulerRuns.errorMessage }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(10),
    messengerStatus().catch(() => null),
  ]);
  const graph = isGraphConfigured();
  const oauth = metaOAuthConfigured();
  const live = isPublishingEnabled();
  const last = runs[0];
  const gaps = runs.slice(0, -1).map((r, i) => (r.at.getTime() - runs[i + 1].at.getTime()) / 1000).filter((g) => g > 0);
  const interval = gaps.length ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : null;
  const ageMin = minutesSince(last?.at);
  const lastError = runs.find((r) => r.status !== "success");
  const f = flags();

  return <SettingsShell active="/settings/integrations" title="التكاملات" description={`الحالة الفعلية لكل تكامل · آخر فحص ${riyadh(checkedAt, "time")}`} actions={<TestConnectionButton />}>
    <div className="banner success">وضع صفر تكلفة مفعّل: لا توجد ترقية أو خدمة مدفوعة تلقائيًا. أي ميزة مستقبلية يجب أن تستخدم Free Tier أو تُوقف بدون رسوم.</div>
    <section className="card card-flush">
      <div className="integration"><span className="logo"><Icon name="facebook" /></span><div><h3>Meta OAuth · Facebook + Instagram</h3><small>{oauth ? "جاهز للربط التلقائي عبر تطبيق Meta." : "الميزة مدمجة وجاهزة، وينقصها فقط META_APP_ID و META_APP_SECRET من تطبيق Meta المجاني."}</small>
        <div className="caps"><Cap on={oauth} label="OAuth" /><Cap on={oauth} label="استيراد الصفحات" /><Cap on={oauth} label="ربط Instagram" /><Cap on={true} label="بدون اشتراك مدفوع" /></div></div>
        <div className="stack" style={{ gap: 6, justifyItems: "end" }}><Status state={oauth ? "ok" : "warn"} text={oauth ? "جاهز" : "ينقص إعداد Meta"} /><Link className="btn btn-ghost btn-sm" href="/pages">مركز الاتصال</Link></div></div>
      <div className="integration"><span className="logo"><Icon name="facebook" /></span><div><h3>Facebook · النشر</h3><small>المزود النشط: {graph ? "Meta Graph API (توكن الصفحة)" : mcp?.actions.includes("create_post") ? "Windsor MCP" : "غير متاح"}{graph && " · Windsor متاح كمزود احتياطي للقراءة"}</small>
        <div className="caps"><Cap on={graph || Boolean(mcp?.actions.includes("create_post"))} label="نشر نص" /><Cap on={graph || Boolean(mcp?.actions.includes("create_photo_post"))} label="نشر صورة" /><Cap on={graph} label="أداء المنشورات" /><Cap on={!live ? true : null} label={live ? "النشر الحقيقي مفعّل" : "وضع الاختبار"} /></div></div>
        <Status state={graph || mcp?.actions.includes("create_post") ? "ok" : "bad"} text={graph || mcp?.actions.includes("create_post") ? "متصل" : "يحتاج ربط"} /></div>
      <div className="integration"><span className="logo"><Icon name="integrations" /></span><div><h3>Windsor MCP · facebook_organic</h3><small>{!process.env.WINDSOR_API_KEY ? "غير مُعد (WINDSOR_API_KEY)" : mcp ? `متصل · الإجراءات المكتشفة: ${mcp.actions.join("، ") || "لا شيء"}` : "تعذر الاتصال خلال 8 ثوانٍ"}</small>
        <div className="caps"><Cap on={Boolean(mcp?.facebookOrganicConnected)} label="Facebook Organic" /><Cap on={Boolean(mcp?.page)} label="الصفحة متاحة" /><Cap on={Boolean(mcp?.actions.includes("create_post"))} label="create_post" /><Cap on={Boolean(mcp?.actions.includes("create_photo_post"))} label="create_photo_post" /></div>
        {graph && <small>ملاحظة: موصل Windsor يرفض النشر الفعلي (Facebook #200 — بدون صلاحية pages_manage_posts)، لذلك يتم النشر عبر توكن الصفحة.</small>}</div>
        <Status state={mcp?.facebookOrganicConnected ? "ok" : process.env.WINDSOR_API_KEY ? "warn" : "off"} text={mcp?.facebookOrganicConnected ? "متصل" : process.env.WINDSOR_API_KEY ? "يحتاج تفويض" : "غير مُعد"} /></div>
      <div className="integration"><span className="logo"><Icon name="inbox" /></span><div><h3>Facebook · التعليقات</h3><small>المزود: {comments?.reply ? "Meta Graph API عبر OAuth" : comments?.connected ? "Facebook connector" : "غير متاح"} · {comments?.reason ?? "متصل"}</small>
        <div className="caps"><Cap on={Boolean(comments?.read)} label="قراءة التعليقات" /><Cap on={Boolean(comments?.repliesRead)} label="قراءة الردود" /><Cap on={Boolean(comments?.reply)} label="الرد" /><Cap on={Boolean(comments?.hide)} label="الإخفاء" /><Cap on={Boolean(comments?.author)} label="اسم الكاتب" /><Cap on={f.replies} label="FACEBOOK_COMMENT_REPLIES_ENABLED" /><Cap on={f.autoReplies} label="AUTO_COMMENT_REPLIES_ENABLED" /></div></div>
        <Status state={comments?.reply && f.replies ? "ok" : comments?.read ? "warn" : "off"} text={comments?.reply && f.replies ? (f.autoReplies&&f.automation ? "يدوي + تلقائي" : "رد يدوي") : comments?.read ? "قراءة فقط" : "غير متاح"} /></div>
      <div className="integration"><span className="logo"><Icon name="inbox" /></span><div><h3>Facebook Messenger</h3><small>المزود: Meta Graph API عبر Page OAuth · يحتاج pages_messaging. استقبال فوري عبر Webhook مع مزامنة دورية احتياطية.</small>
        <div className="caps"><Cap on={Boolean(messenger)} label="Inbox" /><Cap on={Boolean(messenger && Object.values(messenger.pages ?? {}).every((error) => !error))} label="قراءة الرسائل" /><Cap on={Boolean(messenger && Object.values(messenger.pages ?? {}).every((error) => !error))} label="الرد" /><Cap on={true} label="24 ساعة" /></div></div>
        <Status state={!messenger ? "warn" : Object.values(messenger.pages ?? {}).some(Boolean) ? "bad" : "ok"} text={!messenger ? "يحتاج إعادة ربط" : Object.values(messenger.pages ?? {}).some(Boolean) ? "ينقص pages_messaging" : "متصل"} /></div>
      <MetaWebhookSetup />
      <div className="integration"><span className="logo"><Icon name="clock" /></span><div><h3>الجدولة</h3><small>المزود: cron-job.org ← /api/cron/publish (محمي بـ CRON_SECRET)</small>
        <div className="caps"><span className="cap">آخر تشغيل: {last ? riyadh(last.at, "time") : "لا يوجد"}</span><span className="cap">الفاصل: {interval ? `${Math.round(interval)} ث` : "—"}</span><span className="cap">التالي: {last && interval ? riyadh(new Date(last.at.getTime() + interval * 1000), "time") : "—"}</span>{lastError && <span className="cap off">آخر خطأ: {riyadh(lastError.at, "time")}</span>}</div></div>
        <Status state={ageMin < 10 ? "ok" : ageMin < 60 ? "warn" : "bad"} text={ageMin < 10 ? "يعمل" : "متوقف"} /></div>
      <div className="integration"><span className="logo"><Icon name="media" /></span><div><h3>التخزين</h3><small>{storageProvider.configured() ? "Vercel Blob" : "غير مُعد · تُضاف الصور بروابط مباشرة (BLOB_READ_WRITE_TOKEN)"}</small><div className="caps"><Cap on={storageProvider.configured()} label="رفع الصور" /><Cap on={true} label="روابط مباشرة" /></div></div><Status state={storageProvider.configured() ? "ok" : "warn"} text={storageProvider.configured() ? "متصل" : "جزئي"} /></div>
      <div className="integration"><span className="logo"><Icon name="logs" /></span><div><h3>قاعدة البيانات</h3><small>Neon Postgres · {runs.length ? "متصلة" : "متصلة (لا تشغيلات بعد)"}</small></div><Status state="ok" text="متصلة" /></div>
      <div className="integration"><span className="logo"><Icon name="bell" /></span><div><h3>البريد</h3><small>{process.env.RESEND_API_KEY ? "Resend · تنبيهات الفشل تصل بالبريد" : "غير مُعد · الإشعارات داخل النظام فقط (RESEND_API_KEY)"}</small></div><Status state={process.env.RESEND_API_KEY ? "ok" : "off"} text={process.env.RESEND_API_KEY ? "متصل" : "غير مُعد"} /></div>
    </section>
  </SettingsShell>;
}

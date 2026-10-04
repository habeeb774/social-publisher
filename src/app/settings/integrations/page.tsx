import { isPublishingEnabled } from "@/services/publishing-mode";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { schedulerRuns } from "@/db/schema";
import { testWindsorMcp } from "@/services/windsor-mcp";
import { TestConnectionButton } from "./test-connection";
import { AppShell } from "../../ui/app-shell";

export const dynamic = "force-dynamic";
function StatusRow({label,value,ok=false}:{label:string;value:string;ok?:boolean}) {
  return <div className="integration-row"><span>{label}</span><strong className={ok?"status-ok":"status-muted"}>{value}</strong></div>;
}
export default async function IntegrationsSettings() {
  const publishingEnabled = isPublishingEnabled();
  const mcp = await testWindsorMcp().catch(() => null);
  const [lastRun] = await getDb().select({triggeredAt:schedulerRuns.triggeredAt,status:schedulerRuns.status,recent:sql<boolean>`${schedulerRuns.triggeredAt} > now() - interval '15 minutes'`}).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1);
  const recent = Boolean(lastRun?.recent);
  return <AppShell title="التكاملات" eyebrow="إدارة النظام"><main className="settings-page">
    <div className="settings-heading"><div><h1>تكاملات النظام</h1><p>نتائج اتصال خادمي فعلية، وسجل تشغيل عامل النشر.</p></div><span className="safe-badge">{publishingEnabled?"Live":"Safe Mode"}</span></div>
    <div className="integration-stack"><section className="panel-card integration-card">
      <div className="integration-title"><div><h2>Facebook MCP</h2><p>MCP Provider: Windsor.ai</p></div><TestConnectionButton /></div>
      <StatusRow label="Facebook Ads" value={mcp?.facebookAdsConnected?"Connected":"Not connected"} ok={mcp?.facebookAdsConnected}/>
      <StatusRow label="Facebook Organic" value={mcp?.facebookOrganicConnected?"Connected":"Authorization required"} ok={mcp?.facebookOrganicConnected}/>
      <StatusRow label="الصفحة المستهدفة" value={mcp?.page?"متاحة · 1330947143441946":"غير متاحة"} ok={Boolean(mcp?.page)}/>
      <StatusRow label="Read capability" value={mcp?"Available":"Unavailable"} ok={Boolean(mcp)}/>
      <StatusRow label="Publish text · create_post" value={mcp?.actions.includes("create_post")?"Available":"Unavailable"} ok={mcp?.actions.includes("create_post")}/>
      <StatusRow label="Publish photo · create_photo_post" value={mcp?.actions.includes("create_photo_post")?"Available":"Unavailable"} ok={mcp?.actions.includes("create_photo_post")}/>
      <StatusRow label="Vercel runtime MCP access" value={mcp?"Connected":"Blocked"} ok={Boolean(mcp)}/>
      {!mcp && <p className="banner">MCP_RUNTIME_CONNECTION_REQUIRED — تعذر التحقق من اتصال MCP الخادمي.</p>}
    </section><section className="panel-card integration-card"><h2>Scheduler</h2><p>cron-job.org · استدعاء العامل كل دقيقة.</p>
      <StatusRow label="آخر استدعاء موثّق" value={lastRun?lastRun.triggeredAt.toLocaleString("ar-SA",{timeZone:"Asia/Riyadh"}):"لا يوجد تشغيل موثّق"}/>
      <StatusRow label="حالة التشغيل" value={recent && lastRun?.status==="success"?"تشغيل حديث ناجح":"يحتاج التحقق من الجدولة"} ok={recent && lastRun?.status==="success"}/>
      <StatusRow label="Endpoint" value="/api/cron/publish"/>
    </section><section className="panel-card integration-card"><h2>الأمان</h2>
      <StatusRow label="Safe mode" value={publishingEnabled?"Disabled":"Enabled"} ok={!publishingEnabled}/>
      <StatusRow label="Real publishing" value={publishingEnabled?"Enabled":"Disabled"}/>
      <p>لا تُعرض الأسرار في الواجهة. نجاح الاستدعاء لا يثبت نجاح إنشاء منشور على Facebook.</p>
    </section></div>
  </main></AppShell>;
}

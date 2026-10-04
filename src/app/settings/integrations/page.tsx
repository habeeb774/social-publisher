import { getFacebookRuntimeStatus, testFacebookConnection } from "../../../services/facebook";
import { TestConnectionButton } from "./test-connection";

export default async function IntegrationsSettings() {
  const capabilities = await testFacebookConnection();
  const runtimeStatus = getFacebookRuntimeStatus();
  const capabilityRows = [
    ["قراءة الحساب", capabilities.readAccount],
    ["قراءة الصفحات", capabilities.listPages],
    ["قراءة المنشورات", capabilities.readPosts],
    ["نشر نصي", capabilities.publishText],
    ["نشر صورة", capabilities.publishImage],
  ] as const;

  return (
    <main className="shell">
      <h1>تكاملات النظام</h1>
      <section className="card">
        <h2>Facebook MCP</h2>
        <p>MCP Provider: Windsor.ai</p>
        <p>Facebook Organic: {capabilities.connected ? "متصل" : "Authorization required"}</p>
        <p>Vercel runtime MCP access: {runtimeStatus === "connected" ? "Connected" : "Blocked"}</p>
        <TestConnectionButton />
        <p className="muted">لا يتم عرض أو تخزين أي أسرار أو Access Tokens.</p>
        <div className="stack">
          {capabilityRows.map(([label, enabled]) => (
            <div className="row" key={label}>
              <span>{label}</span>
              <span>{enabled ? "✅ متاحة" : "❌ غير متاحة"}</span>
            </div>
          ))}
        </div>
        {runtimeStatus !== "connected" && (
          <div className="banner">BLOCKED_CAPABILITY: MCP tools موجودة، لكن Vercel Runtime لا يملك اتصال Windsor خادميًا مُعدًا بعد.</div>
        )}
      </section>
      <section className="card">
        <h2>Scheduler</h2>
        <p>Provider: cron-job.org</p>
        <p>Status: <strong>External scheduler required</strong></p>
        <p>Interval: Every minute</p>
        <p>Endpoint: <code>/api/cron/publish</code></p>
        <p>Worker: Protected by <code>CRON_SECRET</code></p>
        <p>Safe mode: Enabled — no Facebook post will be created.</p>
        <p className="muted">أنشئ Job خارجيًا من cron-job.org باستخدام POST وAuthorization: Bearer CRON_SECRET. لا تضع السر في الواجهة أو GitHub.</p>
      </section>
    </main>
  );
}

import { getFacebookRuntimeStatus, testFacebookConnection } from "../../../services/facebook";

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
    </main>
  );
}

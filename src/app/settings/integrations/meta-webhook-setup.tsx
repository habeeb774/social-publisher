"use client";

import { useEffect, useState } from "react";
import { toast } from "../../ui/feedback";

type Health = {
  configured: boolean;
  callbackUrl: string | null;
  lastEventAt: string | null;
  lastAction: string | null;
};

export function MetaWebhookSetup() {
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch("/api/meta/webhook/setup", { cache: "no-store" });
    if (!response.ok) throw new Error("تعذر قراءة حالة Webhook");
    setHealth(await response.json());
  };

  useEffect(() => { void load().catch(() => {}); }, []);

  async function setup() {
    setBusy(true);
    try {
      const response = await fetch("/api/meta/webhook/setup", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "تعذر تفعيل Webhook");
      const ok = Array.isArray(data.pages) ? data.pages.filter((p: { ok?: boolean }) => p.ok).length : 0;
      toast(`تم تفعيل Webhook · الصفحات المرتبطة: ${ok}`);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر تفعيل Webhook", "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="integration">
    <span className="logo" style={{ fontWeight: 800 }}>↯</span>
    <div>
      <h3>Meta Webhook · التعليقات الفورية</h3>
      <small>{health?.configured ? "Endpoint آمن بالتوقيع ومجهز لاستقبال أحداث الصفحة." : "إعداد Webhook غير مكتمل."}</small>
      <div className="caps">
        <span className={`cap ${health?.configured ? "on" : "off"}`}>{health?.configured ? "✓" : "—"} التحقق والتوقيع</span>
        <span className="cap">{health?.callbackUrl ?? "Callback غير متاح"}</span>
        <span className={`cap ${health?.lastEventAt ? "on" : ""}`}>{health?.lastEventAt ? `آخر حدث: ${new Date(health.lastEventAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}` : "لم يصل حدث بعد"}</span>
      </div>
    </div>
    <button className="btn btn-secondary btn-sm" disabled={busy || !health?.configured} onClick={setup}>
      {busy ? "جارٍ التفعيل…" : "تفعيل Webhook الآن"}
    </button>
  </div>;
}

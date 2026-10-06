"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmDialog, toast } from "../ui/feedback";

export function MetaAccountActions({ accountId, active }: { accountId: string; active: boolean }) {
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    const ok = await confirmDialog({
      title: "فصل حساب Meta؟",
      message: "سيتم تعطيل القنوات التابعة لهذا الحساب فقط. الصفحات المشتركة مع حساب Meta آخر ستبقى فعّالة.",
      confirmLabel: "فصل الحساب",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch("/api/meta/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect", accountId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "تعذر فصل الحساب");
      toast(`تم فصل الحساب · عُطلت ${data.disabledChannels ?? 0} قناة`);
      window.location.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر فصل الحساب", "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="row">
    <Link className="btn btn-secondary btn-sm" href="/api/meta/oauth/start">
      {active ? "إعادة الربط" : "ربط الحساب"}
    </Link>
    {active && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disconnect}>
      {busy ? "جارٍ الفصل…" : "فصل"}
    </button>}
  </div>;
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "../ui/feedback";

export function LinkInstagramButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function link() {
    setBusy(true);
    try {
      const r = await fetch("/api/pages/instagram", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "تعذر الربط");
      toast(`رُبط: ${d.linked.join("، ")}`);
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر الربط", "error"); } finally { setBusy(false); }
  }
  return <button className="btn btn-secondary" disabled={busy} onClick={link}>{busy ? "جارٍ البحث…" : "ربط انستجرام"}</button>;
}

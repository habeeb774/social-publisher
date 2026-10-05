"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../ui/api";

export function RecycleButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); try { const copy = await api<{ id: string }>(`/api/posts/${id}/duplicate`, { method: "POST" }); router.push(`/posts/${copy.id}/edit`); } catch { setBusy(false); } }}>{busy ? "جارٍ الإنشاء…" : "إعادة استخدام كمسودة"}</button>;
}

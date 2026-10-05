"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "../ui/api";

export type CampaignInput = { id?: string; name: string; description: string; startDate: string; endDate: string; status: string };
import { CAMPAIGN_STATUS_LABELS } from "@/services/catalog";
const STATUSES = Object.entries(CAMPAIGN_STATUS_LABELS);

export function CampaignForm({ initial }: { initial?: CampaignInput }) {
  const router = useRouter();
  const [form, setForm] = useState<CampaignInput>(initial ?? { name: "", description: "", startDate: "", endDate: "", status: "active" });
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      const body = { name: form.name, description: form.description || null, startDate: form.startDate || null, endDate: form.endDate || null, status: form.status };
      const saved = await api<{ id: string }>(initial?.id ? `/api/campaigns/${initial.id}` : "/api/campaigns", { method: initial?.id ? "PATCH" : "POST", body });
      if (initial?.id) router.refresh(); else router.push(`/campaigns/${saved.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  return <form className="post-form panel-card" onSubmit={submit}><h2>{initial?.id ? "تعديل الحملة" : "حملة جديدة"}</h2>
    <label>الاسم<input required maxLength={120} placeholder="مثلًا: اليوم الوطني" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>الوصف<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
    <div className="field-row"><label>البداية<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label><label>النهاية<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label></div>
    <label>الحالة<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    {error && <p className="banner" role="alert">{error}</p>}
    <button className="btn btn-primary">حفظ</button>
  </form>;
}

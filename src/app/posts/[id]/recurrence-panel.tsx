"use client";
import { FormEvent, useEffect, useState } from "react";
import { riyadhInputToIso } from "@/services/post-time";
import { api, riyadh } from "../../ui/api";

type Rule = { id: string; frequency: string; interval: number; nextRunAt: string; endsAt: string | null; maxOccurrences: number | null; occurrences: number; active: boolean };
export function RecurrencePanel({ id }: { id: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [frequency, setFrequency] = useState("weekly");
  const [interval, setInterval] = useState(1);
  const [first, setFirst] = useState("");
  const [count, setCount] = useState(4);
  const [until, setUntil] = useState("");
  const [message, setMessage] = useState("");
  const load = () => api<Rule[]>(`/api/posts/${id}/recurrence`).then(setRules).catch(() => undefined);
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function create(e: FormEvent) {
    e.preventDefault(); setMessage("");
    try {
      await api(`/api/posts/${id}/recurrence`, { method: "POST", body: { frequency, interval, firstRunAt: riyadhInputToIso(first), maxOccurrences: until ? null : count, endsAt: until ? new Date(`${until}T23:59:00+03:00`).toISOString() : null } });
      setMessage("تم إنشاء التكرار. يُنشأ كل موعد كمنشور مستقل قبل موعده بيومين."); load();
    } catch (err) { setMessage(err instanceof Error ? err.message : "تعذر الحفظ"); }
  }
  async function stop(ruleId: string) { await api(`/api/posts/${id}/recurrence?rule=${ruleId}`, { method: "DELETE" }); load(); }
  const active = rules.filter((r) => r.active);
  return <section className="panel-card"><h2>منشور متكرر</h2><small>يُستخدم هذا المنشور كقالب؛ كل موعد يصبح منشورًا مستقلًا له سجله الخاص.</small>
    {active.map((r) => <div key={r.id} className="row-between"><span>{r.frequency === "weekly" ? `كل ${r.interval > 1 ? `${r.interval} أسابيع` : "أسبوع"}` : `كل ${r.interval > 1 ? `${r.interval} أشهر` : "شهر"}`} · القادم {riyadh(r.nextRunAt)} · تم {r.occurrences}{r.maxOccurrences ? ` من ${r.maxOccurrences}` : ""}{r.endsAt ? ` · حتى ${riyadh(r.endsAt)}` : ""}</span><button className="link-button" onClick={() => stop(r.id)}>إيقاف</button></div>)}
    {!active.length && <form className="post-form" onSubmit={create}>
      <div className="field-row"><label>التكرار<select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select></label><label>كل<input type="number" min={1} max={12} value={interval} onChange={(e) => setInterval(Number(e.target.value))} /></label></div>
      <label>أول موعد (الرياض)<input type="datetime-local" required value={first} onChange={(e) => setFirst(e.target.value)} /></label>
      <div className="field-row"><label>عدد المرات<input type="number" min={1} max={260} value={count} disabled={Boolean(until)} onChange={(e) => setCount(Number(e.target.value))} /></label><label>أو حتى تاريخ<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label></div>
      <button className="secondary-button">إنشاء التكرار</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}

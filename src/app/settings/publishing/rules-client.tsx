"use client";
import { useState } from "react";
import type { PublishingRules } from "@/services/publishing-rules";
import { api } from "../../ui/api";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export function RulesClient({ initial }: { initial: PublishingRules }) {
  const [rules, setRules] = useState(initial);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const w = rules.window;
  const toggleDay = (d: number) => setRules({ ...rules, quietWeekdays: rules.quietWeekdays.includes(d) ? rules.quietWeekdays.filter((x) => x !== d) : [...rules.quietWeekdays, d].sort() });
  async function save() { setMessage(""); try { await api("/api/settings/publishing-rules", { method: "PUT", body: rules }); setMessage("تم الحفظ وأُعيد توزيع الطابور"); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر الحفظ"); } }
  return <>
    <section className="card"><h2>فترة إيقاف النشر اليومية</h2>
      <label className="toggle-row"><input type="checkbox" checked={w.enabled} onChange={(e) => setRules({ ...rules, window: { ...w, enabled: e.target.checked } })} /> لا تنشر بين وقتين كل يوم</label>
      <div className="field-row"><label>من<input type="time" value={w.start} disabled={!w.enabled} onChange={(e) => setRules({ ...rules, window: { ...w, start: e.target.value } })} /></label><label>إلى<input type="time" value={w.end} disabled={!w.enabled} onChange={(e) => setRules({ ...rules, window: { ...w, end: e.target.value } })} /></label></div>
      <fieldset className="mode-choice"><legend>عند جدولة منشور داخل فترة الإيقاف أو يوم بدون نشر</legend>
        <label><input type="radio" checked={w.mode === "warn"} onChange={() => setRules({ ...rules, window: { ...w, mode: "warn" } })} /> أظهر تنبيهًا فقط</label>
        <label><input type="radio" checked={w.mode === "shift"} onChange={() => setRules({ ...rules, window: { ...w, mode: "shift" } })} /> انقله تلقائيًا لأول وقت مسموح</label>
      </fieldset>
    </section>
    <section className="card"><h2>أيام بدون نشر</h2>
      <div className="chips">{DAYS.map((d, i) => <button key={d} type="button" className={`chip ${rules.quietWeekdays.includes(i) ? "" : "muted"}`} aria-pressed={rules.quietWeekdays.includes(i)} onClick={() => toggleDay(i)}>{d}</button>)}</div>
      <h3>تواريخ محددة</h3>
      <div className="inline-field"><input type="date" aria-label="تاريخ بدون نشر" value={date} onChange={(e) => setDate(e.target.value)} /><button type="button" className="btn btn-secondary" disabled={!date} onClick={() => { setRules({ ...rules, quietDates: [...new Set([...rules.quietDates, date])].sort() }); setDate(""); }}>إضافة</button></div>
      <div className="chips">{rules.quietDates.map((d) => <span key={d} className="chip">{d}<button className="chip-remove" aria-label={`حذف ${d}`} onClick={() => setRules({ ...rules, quietDates: rules.quietDates.filter((x) => x !== d) })}>×</button></span>)}</div>
      <small>الطابور يتخطى هذه الأيام والأوقات تلقائيًا. المنشورات المجدولة يدويًا حاليًا لا تتغير.</small>
    </section>
    <button className="btn btn-primary" onClick={save}>حفظ قواعد النشر</button>{message && <p role="status">{message}</p>}
  </>;
}

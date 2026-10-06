"use client";
import { useEffect, useState } from "react";

type Slot = { hour: number; weekday: number | null; score: number; posts: number };
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Suggests the strongest posting hours; clicking one sets the time field. */
export function BestTimesHint({ onPick }: { onPick: (time: string) => void }) {
  const [data, setData] = useState<{ ready: boolean; hours: Slot[]; days: Slot[]; reason?: string } | null>(null);
  useEffect(() => { fetch("/api/insights/best-times").then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); }, []);
  if (!data) return null;
  if (!data.ready) return <small className="muted">⏱️ أفضل وقت للنشر: {data.reason}</small>;
  return <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
    <small className="muted">⏱️ أفضل الأوقات حسب تفاعل منشوراتك:</small>
    {data.hours.map((h) => <button key={h.hour} type="button" className="chip" onClick={() => onPick(fmt(h.hour))}>{fmt(h.hour)}</button>)}
    {data.days.length > 0 && <small className="muted">· أفضل الأيام: {data.days.map((d) => DAYS[d.weekday ?? 0]).join("، ")}</small>}
  </div>;
}

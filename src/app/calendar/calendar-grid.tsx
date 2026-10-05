"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS, api } from "../ui/api";

type Entry = { id: string; content: string; status: string; scheduledAt: string; conflict: boolean };
type Cell = { day: number | null; date: string | null; items: Entry[] };
const MOVABLE = ["scheduled", "pending_approval", "approved", "draft"];
const time = (iso: string) => new Date(iso).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

export function CalendarGrid({ days, cells, today }: { days: string[]; cells: Cell[]; today: string }) {
  const router = useRouter();
  const [drag, setDrag] = useState<Entry | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function drop(date: string) {
    const entry = drag; setDrag(null); setOver(null);
    if (!entry || !MOVABLE.includes(entry.status)) return;
    // Keep the original Riyadh time of day; only the date changes.
    const riyadhTime = new Date(new Date(entry.scheduledAt).getTime() + 3 * 3600000).toISOString().slice(11, 16);
    const target = new Date(`${date}T${riyadhTime}:00+03:00`);
    if (target.toISOString() === new Date(entry.scheduledAt).toISOString()) return;
    if (!confirm(`نقل المنشور إلى ${date} الساعة ${riyadhTime} (الرياض)؟`)) return;
    try {
      const r = await api<{ nearby: number }>(`/api/posts/${entry.id}/reschedule`, { method: "POST", body: { scheduledAt: target.toISOString() } });
      setMessage(r.nearby ? `تم النقل. تنبيه: يوجد ${r.nearby} منشور آخر خلال 5 دقائق من هذا الموعد.` : "تم النقل");
      router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر النقل"); }
  }
  return <>
    {message && <p className="banner" role="status">{message}</p>}
    <section className="panel-card calendar-card"><div className="calendar-grid">{days.map((d) => <b key={d}>{d}</b>)}
      {cells.map((cell, index) => cell.day === null ? <div className="calendar-day" key={index} /> :
        <div key={index} className={`calendar-day ${cell.date === today ? "today" : ""} ${over === cell.date ? "drop-target" : ""}`} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(cell.date); } }} onDragLeave={() => setOver(null)} onDrop={() => drop(cell.date!)}>
          <span>{cell.day}</span>
          {cell.items.map((item) => <Link key={item.id} href={`/posts/${item.id}`} draggable={MOVABLE.includes(item.status)} onDragStart={() => setDrag(item)} onDragEnd={() => { setDrag(null); setOver(null); }} className={`calendar-entry status-${item.status} ${item.conflict ? "conflict" : ""}`} title={item.conflict ? "منشورات متقاربة خلال 5 دقائق" : MOVABLE.includes(item.status) ? "اسحب لنقله ليوم آخر" : "منشور — لا يمكن نقله"}>
            {item.conflict && "⚠ "}{time(item.scheduledAt)} · {STATUS_LABELS[item.status]}<br />{item.content.slice(0, 50)}
          </Link>)}
        </div>)}
    </div></section>
  </>;
}

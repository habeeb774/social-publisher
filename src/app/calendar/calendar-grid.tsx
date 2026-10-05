"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS, api } from "../ui/api";
import { confirmDialog, toast } from "../ui/feedback";

type Entry = { id: string; content: string; status: string; scheduledAt: string; conflict: boolean };
type Cell = { day: number | null; date: string | null; items: Entry[]; label?: string };
const MOVABLE = ["scheduled", "pending_approval", "approved", "draft"];
const time = (iso: string) => new Date(iso).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

/** Month or week grid with drag & drop rescheduling (time of day is kept; published posts never move). */
export function CalendarGrid({ days, cells, today, variant = "month" }: { days: string[]; cells: Cell[]; today: string; variant?: "month" | "week" }) {
  const router = useRouter();
  const [drag, setDrag] = useState<Entry | null>(null);
  const [over, setOver] = useState<string | null>(null);
  async function drop(date: string) {
    const entry = drag; setDrag(null); setOver(null);
    if (!entry || !MOVABLE.includes(entry.status)) return;
    const riyadhTime = new Date(new Date(entry.scheduledAt).getTime() + 3 * 3600000).toISOString().slice(11, 16);
    const target = new Date(`${date}T${riyadhTime}:00+03:00`);
    if (target.toISOString() === new Date(entry.scheduledAt).toISOString()) return;
    if (!await confirmDialog({ title: "نقل موعد المنشور؟", message: `إلى ${date} الساعة ${riyadhTime} (الرياض).`, confirmLabel: "نقل" })) return;
    try {
      const r = await api<{ nearby: number }>(`/api/posts/${entry.id}/reschedule`, { method: "POST", body: { scheduledAt: target.toISOString() } });
      toast(r.nearby ? `تم النقل · تنبيه: ${r.nearby} منشور آخر خلال 5 دقائق من هذا الموعد` : "تم نقل الموعد", r.nearby ? "warning" : "success");
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر النقل", "error"); }
  }
  return <section className="card calendar-card"><div className={variant === "week" ? "calendar-week" : "calendar-grid"}>{variant === "month" && days.map((d) => <b key={d}>{d}</b>)}
    {cells.map((cell, index) => cell.day === null ? <div className="calendar-day outside" key={index} /> :
      <div key={index} className={`calendar-day ${cell.date === today ? "today" : ""} ${over === cell.date ? "drop-target" : ""}`} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(cell.date); } }} onDragLeave={() => setOver(null)} onDrop={() => drop(cell.date!)}>
        <span>{cell.label ?? cell.day}</span>
        {cell.items.map((item) => <Link key={item.id} href={`/posts/${item.id}`} draggable={MOVABLE.includes(item.status)} onDragStart={() => setDrag(item)} onDragEnd={() => { setDrag(null); setOver(null); }} className={`calendar-entry status-${item.status} ${item.conflict ? "conflict" : ""}`} title={`${time(item.scheduledAt)} · ${STATUS_LABELS[item.status]} — ${item.content.slice(0, 120)}`}>
          {item.conflict && "⚠ "}<b className="num">{time(item.scheduledAt)}</b> {item.content.slice(0, variant === "week" ? 90 : 40)}
        </Link>)}
      </div>)}
  </div></section>;
}

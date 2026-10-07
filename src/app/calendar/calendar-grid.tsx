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
const localTime = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(11, 16);

export function CalendarGrid({ days, cells, today, variant = "month" }: { days: string[]; cells: Cell[]; today: string; variant?: "month" | "week" }) {
  const router = useRouter();
  const [drag, setDrag] = useState<Entry | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<Entry | null>(null);

  async function move(entry: Entry, date: string) {
    if (!MOVABLE.includes(entry.status)) return;
    const riyadhTime = localTime(entry.scheduledAt);
    const target = new Date(`${date}T${riyadhTime}:00+03:00`);
    if (target.toISOString() === new Date(entry.scheduledAt).toISOString()) { setMoving(null); return; }
    if (!await confirmDialog({ title: "نقل موعد المنشور؟", message: `إلى ${date} الساعة ${riyadhTime} (الرياض). سيتم الاحتفاظ بوقت النشر نفسه.`, confirmLabel: "نقل" })) return;
    try {
      const r = await api<{ nearby: number }>(`/api/posts/${entry.id}/reschedule`, { method: "POST", body: { scheduledAt: target.toISOString() } });
      toast(r.nearby ? `تم النقل · تنبيه: ${r.nearby} منشور آخر خلال 5 دقائق من هذا الموعد` : "تم نقل الموعد", r.nearby ? "warning" : "success");
      setMoving(null); router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر النقل", "error"); }
  }

  async function drop(date: string) {
    const entry = drag; setDrag(null); setOver(null);
    if (entry) await move(entry, date);
  }

  return <section className="card calendar-card">
    {moving && <div className="calendar-move-banner" role="status">
      <span><b>نقل المنشور:</b> {moving.content.slice(0, 70)}{moving.content.length > 70 ? "…" : ""}</span>
      <span>اختر اليوم الجديد · سيبقى الوقت {time(moving.scheduledAt)}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoving(null)}>إلغاء</button>
    </div>}
    <div className={variant === "week" ? "calendar-week" : "calendar-grid"}>{variant === "month" && days.map((d) => <b key={d}>{d}</b>)}
      {cells.map((cell, index) => cell.day === null ? <div className="calendar-day outside" key={index} /> :
        <div key={index}
          className={`calendar-day ${cell.date === today ? "today" : ""} ${over === cell.date ? "drop-target" : ""} ${moving && cell.date ? "move-target" : ""}`}
          onClick={(e) => { if (moving && cell.date && e.target === e.currentTarget) void move(moving, cell.date); }}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(cell.date); } }}
          onDragLeave={() => setOver(null)} onDrop={() => drop(cell.date!)}>
          <button type="button" className="calendar-day-label" onClick={() => moving && cell.date ? void move(moving, cell.date) : undefined}>{cell.label ?? cell.day}</button>
          {cell.items.map((item) => <div key={item.id} className="calendar-entry-wrap">
            <Link href={moving ? "#" : `/posts/${item.id}`} draggable={!moving && MOVABLE.includes(item.status)}
              onClick={(e) => { if (moving) e.preventDefault(); }}
              onDragStart={() => setDrag(item)} onDragEnd={() => { setDrag(null); setOver(null); }}
              className={`calendar-entry status-${item.status} ${item.conflict ? "conflict" : ""} ${moving?.id === item.id ? "moving" : ""}`}
              title={`${time(item.scheduledAt)} · ${STATUS_LABELS[item.status]} — ${item.content.slice(0, 120)}`}>
              {item.conflict && "⚠ "}<b className="num">{time(item.scheduledAt)}</b> {item.content.slice(0, variant === "week" ? 90 : 40)}
            </Link>
            {MOVABLE.includes(item.status) && !moving && <button type="button" className="calendar-move-btn" aria-label="نقل المنشور إلى يوم آخر" title="نقل إلى يوم آخر" onClick={() => setMoving(item)}>↔</button>}
          </div>)}
        </div>)}
    </div>
  </section>;
}

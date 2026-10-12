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
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const selectedCell = cells.find((cell) => cell.date === selectedDate);

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
          className={`calendar-day ${cell.date === selectedDate ? "mobile-selected" : ""} ${cell.date === today ? "today" : ""} ${over === cell.date ? "drop-target" : ""} ${moving && cell.date ? "move-target" : ""}`}
          onClick={(e) => { if (moving && cell.date && e.target === e.currentTarget) void move(moving, cell.date); }}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(cell.date); } }}
          onDragLeave={() => setOver(null)} onDrop={() => drop(cell.date!)}>
          <button type="button" className="calendar-day-label" onClick={() => { if (moving && cell.date) void move(moving, cell.date); else setSelectedDate(cell.date); }}>{cell.label ?? cell.day}</button>
          <button type="button" className="calendar-mobile-count" onClick={() => setSelectedDate(cell.date)}>{cell.items.length || "·"}</button>
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
    <div className="calendar-mobile-details"><strong>{selectedDate ? `منشورات ${selectedDate}` : "اختر يومًا"}</strong>{selectedCell?.items.length ? selectedCell.items.map((item) => <Link key={item.id} href={`/posts/${item.id}`} className="calendar-mobile-post"><span className="num">{time(item.scheduledAt)}</span><span>{item.content.slice(0, 110)}</span><small>{STATUS_LABELS[item.status]}</small></Link>) : <p>لا توجد منشورات مجدولة لهذا اليوم.</p>}</div>
    <style jsx global>{`.calendar-mobile-count,.calendar-mobile-details{display:none}
@media(max-width:700px){
.calendar-toolbar{display:flex;flex-wrap:wrap;gap:8px}
.calendar-toolbar .segmented{width:100%;justify-content:space-between}
.calendar-toolbar strong{flex:1;text-align:center;min-width:100px;font-size:14px}
.calendar-card{overflow:hidden}
.calendar-grid{grid-template-columns:repeat(7,minmax(0,1fr))!important}
.calendar-grid>.calendar-day,.calendar-week>.calendar-day{box-sizing:border-box;min-width:0!important;min-height:68px!important;height:68px!important;max-height:68px!important;overflow:hidden!important;padding:5px 2px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:4px!important}
.calendar-grid>.calendar-day.outside{min-height:68px!important}
.calendar-grid>b{font-size:10px;overflow:hidden;white-space:nowrap;text-align:center}
.calendar-grid .calendar-day-label,.calendar-week .calendar-day-label{font-size:13px;padding:2px!important;min-height:24px}
.calendar-grid .calendar-entry-wrap,.calendar-week .calendar-entry-wrap{display:none!important}
.calendar-grid .calendar-mobile-count,.calendar-week .calendar-mobile-count{display:flex!important;align-items:center;justify-content:center;min-width:24px;height:22px;border:0;border-radius:7px;background:rgba(59,130,246,.12);color:var(--heading);font-size:12px;font-weight:700}
.calendar-grid .mobile-selected,.calendar-week .mobile-selected{outline:2px solid #3b82f6;outline-offset:-2px}
.calendar-week{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:3px!important;align-items:start!important}
.calendar-week>.calendar-day{width:auto!important;max-width:100%!important}
.calendar-mobile-details{display:flex;flex-direction:column;gap:9px;padding:14px}
.calendar-mobile-details>strong{font-size:15px}
.calendar-mobile-details>p{font-size:13px;opacity:.7}
.calendar-mobile-post{display:flex;flex-direction:column;gap:4px;padding:11px;border:1px solid rgba(128,128,128,.25);border-radius:10px;color:var(--heading);text-decoration:none;overflow-wrap:anywhere}
.calendar-mobile-post>small{opacity:.75}
}`}</style>
  </section>;
}

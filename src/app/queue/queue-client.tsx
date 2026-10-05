"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATUS_LABELS, api, riyadh } from "../ui/api";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
type Slot = { weekday: number; time: string };
type Item = { id: string; content: string; status: string; scheduledAt: string | null };

export function QueueClient({ initialSlots, queued, drafts }: { initialSlots: Slot[]; queued: Item[]; drafts: Item[] }) {
  const router = useRouter();
  const [slots, setSlots] = useState(initialSlots);
  const [items, setItems] = useState(queued);
  const [dragging, setDragging] = useState<number | null>(null);
  const [newDay, setNewDay] = useState(6);
  const [newTime, setNewTime] = useState("20:00");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirtySlots = JSON.stringify(slots) !== JSON.stringify(initialSlots);

  async function saveSlots() {
    setBusy(true); setMessage("");
    try { await api("/api/queue", { method: "PUT", body: { slots } }); setMessage("تم حفظ الأوقات وإعادة توزيع الطابور"); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر الحفظ"); } finally { setBusy(false); }
  }
  async function reorder(next: Item[]) {
    setItems(next); setBusy(true); setMessage("");
    try {
      const { assigned } = await api<{ assigned: Array<{ id: string; scheduledAt: string }> }>("/api/queue", { method: "POST", body: { order: next.map((i) => i.id) } });
      const times = new Map(assigned.map((a) => [a.id, a.scheduledAt]));
      setItems(next.map((i) => ({ ...i, scheduledAt: times.get(i.id) ?? i.scheduledAt })));
      setMessage("أُعيد حساب أوقات النشر حسب الترتيب الجديد");
    } catch (e) { setMessage(e instanceof Error ? e.message : "تعذر إعادة الترتيب"); setItems(items); } finally { setBusy(false); }
  }
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length || from === to) return; const next = [...items]; const [it] = next.splice(from, 1); next.splice(to, 0, it); reorder(next); };
  async function enqueue(id: string) {
    setBusy(true); setMessage("");
    try { await api(`/api/posts/${id}/queue`, { method: "POST" }); router.refresh(); const q = await api<{ queued: Item[] }>("/api/queue"); setItems(q.queued.map((i) => ({ ...i, scheduledAt: i.scheduledAt }))); setMessage("أُضيف المنشور إلى أول وقت متاح"); } catch (e) { setMessage(e instanceof Error ? e.message : "تعذرت الإضافة"); } finally { setBusy(false); }
  }

  return <div className="queue-layout">
    <section className="panel-card"><h2>أوقات النشر الأسبوعية</h2><p>عند «إضافة إلى الطابور» يأخذ المنشور أول وقت متاح من هذه الأوقات (توقيت الرياض).</p>
      <div className="slot-grid">{DAYS.map((day, d) => <div key={d} className="slot-day"><b>{day}</b>{slots.filter((s) => s.weekday === d).sort((a, b) => a.time.localeCompare(b.time)).map((s) => <span className="chip" key={s.time}>{s.time}<button aria-label={`حذف ${day} ${s.time}`} className="chip-remove" onClick={() => setSlots(slots.filter((x) => !(x.weekday === d && x.time === s.time)))}>×</button></span>)}</div>)}</div>
      <div className="inline-field"><select aria-label="اليوم" value={newDay} onChange={(e) => setNewDay(Number(e.target.value))}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select><input aria-label="الوقت" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} /><button className="secondary-button" onClick={() => !slots.some((s) => s.weekday === newDay && s.time === newTime) && /^\d{2}:\d{2}$/.test(newTime) && setSlots([...slots, { weekday: newDay, time: newTime }])}>إضافة وقت</button><button className="secondary-button" onClick={() => setSlots([...slots.filter((s) => s.time !== newTime), ...DAYS.map((_, i) => ({ weekday: i, time: newTime }))])}>لكل الأيام</button></div>
      {dirtySlots && <button className="primary-button" disabled={busy} onClick={saveSlots}>حفظ الأوقات</button>}
    </section>
    <section className="panel-card"><h2>الطابور ({items.length})</h2>{message && <p className="banner" role="status">{message}</p>}
      {!items.length ? <p>الطابور فارغ. أضف مسودة من القائمة أدناه أو من صفحة المنشور.</p> : <ol className="queue-list" aria-label="ترتيب الطابور">{items.map((item, i) => <li key={item.id} draggable={!busy} onDragStart={() => setDragging(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragging !== null) move(dragging, i); setDragging(null); }} className={dragging === i ? "dragging" : ""}>
        <span className="drag-handle" aria-hidden="true">⋮⋮</span>
        <div><Link href={`/posts/${item.id}`}>{item.content.slice(0, 110)}{item.content.length > 110 ? "…" : ""}</Link><small>{riyadh(item.scheduledAt)} · {STATUS_LABELS[item.status]}</small></div>
        <span className="row-actions"><button className="icon-button" aria-label="للأعلى" disabled={busy || i === 0} onClick={() => move(i, i - 1)}>↑</button><button className="icon-button" aria-label="للأسفل" disabled={busy || i === items.length - 1} onClick={() => move(i, i + 1)}>↓</button></span>
      </li>)}</ol>}
    </section>
    <section className="panel-card"><h2>مسودات جاهزة للطابور</h2>{!drafts.length ? <p>لا توجد مسودات. <Link href="/posts/new">أنشئ منشورًا</Link></p> : <ul className="timeline-list">{drafts.map((d) => <li key={d.id} className="row-between"><span>{d.content.slice(0, 90)}{d.content.length > 90 ? "…" : ""}</span><button className="secondary-button" disabled={busy || !slots.length} onClick={() => enqueue(d.id)}>إضافة إلى الطابور</button></li>)}</ul>}{!initialSlots.length && <small>احفظ أوقات النشر أولًا.</small>}</section>
  </div>;
}

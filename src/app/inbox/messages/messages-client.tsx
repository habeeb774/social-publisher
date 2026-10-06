"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "../../ui/feedback";
import { EmptyState } from "../../ui/empty-state";
import { Skeleton } from "../../ui/kit";

type Conversation = { id: string; participant_name: string | null; last_message: string | null; last_message_at: string | null; unread: boolean; page_name: string };
type Message = { id: string; from_name: string | null; message: string; is_from_page: boolean; created_time: string; sent_by: string | null };
type Detail = { conversation: { id: string; participant_name: string | null; page_name: string; canReply: boolean }; messages: Message[] };
type Status = { checkedAt: string; pages: Record<string, string | null> } | null;

const time = (v: string | null) => v ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "";
async function api<T>(query: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/messages${query}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "تعذر التنفيذ");
  return d as T;
}

export function MessagesClient({ canReply }: { canReply: boolean }) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api<{ items: Conversation[]; status: Status }>(""); setItems(d.items); setStatus(d.status); }
    catch (e) { setItems([]); toast(e instanceof Error ? e.message : "تعذر تحميل الرسائل", "error"); }
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  const open = async (id: string) => { try { setDetail(await api<Detail>(`?id=${id}`)); setText(""); } catch (e) { toast(e instanceof Error ? e.message : "تعذر فتح المحادثة", "error"); } };
  const sync = async () => { setBusy(true); try { const r = await api<{ imported: number }>("", { action: "sync" }); toast(`اكتملت المزامنة (${r.imported} رسالة جديدة)`); await load(); } catch (e) { toast(e instanceof Error ? e.message : "تعذرت المزامنة", "error"); } finally { setBusy(false); } };
  const send = async () => {
    if (!detail) return; setBusy(true);
    try { await api("", { action: "reply", id: detail.conversation.id, text }); toast("أُرسل الرد على ماسنجر"); await open(detail.conversation.id); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر الإرسال", "error"); } finally { setBusy(false); }
  };
  const errors = Object.entries(status?.pages ?? {}).filter(([, e]) => e);

  return <>
    {errors.length > 0
      ? <div className="alert alert-warning" role="note"><span><b>Messenger يحتاج إعادة ربط.</b> {errors.map(([p, e]) => `${p}: ${String(e).includes("#10") || String(e).includes("#200") || String(e).includes("#230") ? "ينقص إذن pages_messaging" : e}`).join(" · ")}</span></div>
      : status && <div className="alert alert-success" role="note"><span><b>Messenger متصل.</b> استقبال الرسائل الفورية عبر Webhook والمزامنة الدورية الاحتياطية متاحان.</span></div>}
    <div className={`inbox ${detail ? "has-selection" : ""}`}>
      <section className="inbox-list" aria-label="المحادثات">
        <div className="search row"><strong style={{ flex: 1 }}>رسائل ماسنجر</strong><button className="btn btn-secondary btn-sm" disabled={busy} onClick={sync}>مزامنة</button></div>
        <div className="inbox-items">{items === null ? <div style={{ padding: 16 }}><Skeleton lines={4} /></div> : !items.length ? <EmptyState icon="inbox" title="لا توجد رسائل" description="عند تفعيل pages_messaging تصل الرسائل عبر Meta Webhook مباشرة، وتبقى المزامنة الدورية احتياطية." /> :
          items.map((i) => <button key={i.id} className={`inbox-item ${detail?.conversation.id === i.id ? "active" : ""} ${i.unread ? "unread" : ""}`} onClick={() => open(i.id)}>
            <span className="avatar" style={{ width: 32, height: 32 }}>{(i.participant_name ?? "؟").slice(0, 1)}</span>
            <span className="row-between"><b>{i.participant_name ?? "متابع"}</b><small className="num">{time(i.last_message_at)}</small></span>
            <p className="clamp-2">{i.last_message}</p><small><span className="badge badge-info">{i.page_name}</span></small>
          </button>)}</div>
      </section>
      <section className="inbox-thread" aria-label="المحادثة">
        {!detail ? <EmptyState icon="inbox" title="اختر محادثة" description="تظهر هنا الرسائل ويمكنك الرد خلال 24 ساعة من آخر رسالة للعميل." /> : <>
          <header><div className="row"><button className="btn btn-ghost btn-sm mobile-only" onClick={() => setDetail(null)}>رجوع</button><b style={{ color: "var(--heading)" }}>{detail.conversation.participant_name ?? "متابع"}</b><small>{detail.conversation.page_name}</small></div></header>
          <div className="inbox-messages">{detail.messages.map((m) => <div key={m.id} className={`bubble ${m.is_from_page ? "outgoing" : ""}`}><p className="pre">{m.message || "(مرفق)"}</p><small>{time(m.created_time)}{m.sent_by && <> · {m.sent_by}</>}</small></div>)}</div>
          {canReply && <div className="reply-composer">
            {!detail.conversation.canReply && <small className="muted">مرّ أكثر من 24 ساعة على آخر رسالة من العميل؛ لا يسمح فيسبوك بالرد حتى يراسلك مجددًا.</small>}
            <textarea aria-label="نص الرد" placeholder="اكتب ردك…" value={text} disabled={!detail.conversation.canReply} onChange={(e) => setText(e.target.value)} />
            <div className="row-between"><span /><button className="btn btn-primary btn-sm" disabled={busy || !text.trim() || !detail.conversation.canReply} onClick={send}>إرسال</button></div>
          </div>}
        </>}
      </section>
    </div>
  </>;
}

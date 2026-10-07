"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../ui/feedback";
import { EmptyState } from "../../ui/empty-state";
import { Skeleton } from "../../ui/kit";
import { inboxJson } from "../inbox-request";
import Link from "next/link";
import { convertMessengerLead } from "./lead-conversion";
import { messengerSyncNotice } from "@/services/messenger-sync-result";

type Conversation = { id: string; participant_name: string | null; last_message: string | null; last_message_at: string | null; unread: boolean; page_name: string; state?: string };
type Message = { id: string; from_name: string | null; message: string; is_from_page: boolean; created_time: string; sent_by: string | null };
type Detail = { conversation: { id: string; participant_name: string | null; page_name: string; canReply: boolean }; messages: Message[] };
type Status = { checkedAt: string; pages: Record<string, string | null> } | null;
type Catalog = { accounts: Array<{ id: string; name: string; status: string }>; pages: Array<{ id: string; name: string; accountId: string | null; accountName: string | null }> };

const time = (v: string | null) => v ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "";
async function api<T>(query: string, body?: unknown): Promise<T> {
  return inboxJson<T>(`/api/messages${query}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
}

export function MessagesClient({ canReply, canManage = false, canCreateLead = false }: { canReply: boolean; canManage?: boolean; canCreateLead?: boolean }) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("");
  const [page, setPage] = useState("");
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], pages: [] });
  const [q, setQ] = useState("");
  const [state, setState] = useState("active");
  const [listError, setListError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [convertedLead, setConvertedLead] = useState<string | null>(null);
  const converting = useRef(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  useEffect(() => () => { ++listRequest.current; ++detailRequest.current; }, []);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    try { const d = await api<{ items: Conversation[]; status: Status; catalog: Catalog }>(`?${new URLSearchParams({ ...(account ? { account } : {}), ...(page ? { page } : {}), ...(q.trim() ? { q: q.trim() } : {}), state }).toString()}`); if (request !== listRequest.current) return; setListError(false); setItems(d.items); setStatus(d.status); setCatalog(d.catalog ?? { accounts: [], pages: [] }); }
    catch { if (request === listRequest.current) setListError(true); }
  }, [account, page, q, state]);
  useEffect(() => { const requests = listRequest; const t = setTimeout(load, 220); return () => { clearTimeout(t); ++requests.current; }; }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  const open = async (id: string) => {
    const request = ++detailRequest.current;
    setSelectedId(id); setDetail(null); setDetailError(false); setText(""); setConvertedLead(null);
    try { const result = await api<Detail>(`?id=${id}`); if (request === detailRequest.current) setDetail(result); }
    catch { if (request === detailRequest.current) setDetailError(true); }
  };
  const close = () => { ++detailRequest.current; setSelectedId(null); setDetail(null); setDetailError(false); };
  const sync = async () => {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      const result = await api<unknown>("", { action: "sync" });
      const notice = messengerSyncNotice(result);
      toast(notice.message, notice.type);
      await load();
    } catch { toast("تعذرت المزامنة. راجع حالة الاتصال وحاول مجددًا.", "error"); }
    finally { setBusy(false); }
  };
  const updateConversation = async (action: "state" | "unread", value: string | boolean) => {
    if (!detail || !canManage || busy) return;
    setBusy(true);
    try {
      await api("", { action, id: detail.conversation.id, value });
      toast(action === "state" ? (value === "resolved" ? "تم حل المحادثة" : value === "archived" ? "أُرشفت المحادثة" : "أُعيد فتح المحادثة") : value ? "عُلّمت كغير مقروء" : "عُلّمت كمقروء");
      if (value === "archived") close();
      else if (action !== "unread") await open(detail.conversation.id);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر تحديث المحادثة", "error");
    } finally {
      setBusy(false);
    }
  };

  const createLead = async () => {
    if (!detail || busy || !canCreateLead || converting.current) return;
    const request = detailRequest.current;
    converting.current = true; setBusy(true);
    try {
      const id = await convertMessengerLead(detail.conversation.id);
      if (request === detailRequest.current) setConvertedLead(id);
      toast("تمت إضافة المحادثة إلى العملاء المحتملين", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "تعذر إنشاء العميل المحتمل", "error"); }
    finally { converting.current = false; setBusy(false); }
  };
  const send = async () => {
    if (!detail || busy || !canReply || !text.trim() || !detail.conversation.canReply) return; setBusy(true);
    try { await api("", { action: "reply", id: detail.conversation.id, text }); toast("أُرسل الرد على ماسنجر"); await open(detail.conversation.id); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "تعذر الإرسال", "error"); } finally { setBusy(false); }
  };
  const errors = Object.entries(status?.pages ?? {}).filter(([, e]) => e);

  return <>
    {errors.length > 0
      ? <div className="alert alert-warning" role="note"><span><b>تعذرت آخر مزامنة لبعض الصفحات.</b> {errors.map(([p]) => p).join(" · ")} — راجع الاتصال والصلاحيات.</span></div>
      : status && <div className="alert alert-success" role="note"><span><b>آخر مزامنة تمت دون أخطاء مسجلة.</b> لا يؤكد ذلك وحده استقبال أحداث Webhook.</span></div>}
    <div className={`inbox ${selectedId ? "has-selection" : ""}`}>
      <section className="inbox-list" aria-label="المحادثات">
        <div className="search row"><strong style={{ flex: 1 }}>رسائل ماسنجر</strong>{canManage && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={sync}>مزامنة</button>}</div>
        {(catalog.accounts.length > 1 || catalog.pages.length > 1) && <div className="search row">
          {catalog.accounts.length > 1 && <select aria-label="حساب Meta" value={account} onChange={(e) => { setAccount(e.target.value); setPage(""); }}><option value="">كل حسابات Meta</option>{catalog.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
          {catalog.pages.length > 1 && <select aria-label="الصفحة" value={page} onChange={(e) => setPage(e.target.value)}><option value="">كل الصفحات</option>{catalog.pages.filter((p) => !account || p.accountId === account).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        </div>}
        <div className="search row">
          <input type="search" aria-label="بحث في Messenger" placeholder="ابحث بالاسم أو الرسالة…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="حالة المحادثة" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="active">النشطة</option>
            <option value="unread">غير المقروءة</option>
            <option value="archived">المؤرشفة</option>
            <option value="all">الكل</option>
          </select>
        </div>
        <div className="inbox-items">{listError && <div role="alert" style={{ padding: 16 }}><p>تعذر تحديث الرسائل. البيانات الظاهرة قد تكون قديمة.</p><button className="btn btn-secondary btn-sm" onClick={() => void load()}>إعادة المحاولة</button></div>}{items === null ? (listError ? null : <div style={{ padding: 16 }}><Skeleton lines={4} /></div>) : !items.length ? (listError ? null : <EmptyState icon="inbox" title="لا توجد رسائل" description="لا توجد محادثات مطابقة للفلاتر الحالية." />) :
          items.map((i) => <button key={i.id} className={`inbox-item ${selectedId === i.id ? "active" : ""} ${i.unread ? "unread" : ""}`} disabled={busy} onClick={() => open(i.id)}>
            <span className="avatar" style={{ width: 32, height: 32 }}>{(i.participant_name ?? "؟").slice(0, 1)}</span>
            <span className="row-between"><b>{i.participant_name ?? "متابع"}</b><small className="num">{time(i.last_message_at)}</small></span>
            <p className="clamp-2">{i.last_message}</p><small><span className="badge badge-info">{i.page_name}</span></small>
          </button>)}</div>
      </section>
      <section className="inbox-thread" aria-label="المحادثة">
        {!detail ? (selectedId ? <div style={{ padding: 16 }}><button className="btn btn-ghost btn-sm" disabled={busy} onClick={close}>رجوع</button>{detailError ? <div role="alert"><p>تعذر تحميل المحادثة.</p><button className="btn btn-secondary btn-sm" onClick={() => void open(selectedId)}>إعادة المحاولة</button></div> : <Skeleton lines={4} />}</div> : <EmptyState icon="inbox" title="اختر محادثة" description="تظهر هنا الرسائل ويمكنك الرد خلال 24 ساعة من آخر رسالة للعميل." />) : <>
          <header><div className="row"><button className="btn btn-ghost btn-sm mobile-only" disabled={busy} onClick={close}>رجوع</button><b style={{ color: "var(--heading)" }}>{detail.conversation.participant_name ?? "متابع"}</b><small>{detail.conversation.page_name}</small></div><div className="row">
            {canCreateLead && (convertedLead ? <Link className="btn btn-secondary btn-sm" href={`/leads/${convertedLead}`}>فتح العميل المحتمل</Link> : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={createLead}>إضافة كعميل محتمل</button>)}
            {canManage && <><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => updateConversation("state","resolved")}>تم الحل</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateConversation("unread",true)}>غير مقروء</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateConversation("state","archived")}>أرشفة</button></>}
          </div></header>
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

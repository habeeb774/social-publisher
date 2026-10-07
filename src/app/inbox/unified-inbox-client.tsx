"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { toast } from "../ui/feedback";
import { Icon } from "../ui/icons";
import { Skeleton } from "../ui/kit";
import { inboxJson as json } from "./inbox-request";

type Source = "all" | "comments" | "messenger";
type Item = {
  kind: "comment" | "messenger";
  id: string;
  person: string;
  preview: string;
  pageName: string;
  pageId: string;
  occurredAt: string;
  unread: boolean;
  needsReply: boolean;
  sentiment: string;
  state?: string;
};
type Catalog = {
  accounts: Array<{ id: string; name: string; status: string }>;
  pages: Array<{ id: string; name: string; account_id?: string | null; account_name?: string | null }>;
};
type CommentDetail = {
  comment: { id: string; message: string; author_name: string | null; page_name: string; created_time: string; status: string; sentiment: string };
  thread: Array<{ id: string; message: string; author_name: string | null; created_time: string }>;
  replies: Array<{ id: string; content: string; status: string; reply_type: string; created_at: string }>;
};
type MessengerDetail = {
  conversation: { id: string; participant_name: string | null; page_name: string; canReply: boolean };
  messages: Array<{ id: string; from_name: string | null; message: string; is_from_page: boolean; created_time: string; sent_by: string | null }>;
};
type Template = { id: string; name: string; content: string; active: boolean };

export function UnifiedInboxClient({ canReply,initialSource='all',initialQuery='' }: { canReply: boolean;initialSource?:Source;initialQuery?:string }) {
  const [source, setSource] = useState<Source>(initialSource);
  const [account, setAccount] = useState("");
  const [page, setPage] = useState("");
  const [q, setQ] = useState(initialQuery);
  const [messengerState, setMessengerState] = useState("active");
  const [items, setItems] = useState<Item[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], pages: [] });
  const [selected, setSelected] = useState<Item | null>(null);
  const [commentDetail, setCommentDetail] = useState<CommentDetail | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessengerDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  useEffect(() => () => { ++listRequest.current; ++detailRequest.current; }, []);

  const visiblePages = useMemo(
    () => catalog.pages.filter((item) => !account || item.account_id === account),
    [catalog.pages, account],
  );

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    const query = new URLSearchParams({ source });
    if (account) query.set("account", account);
    if (page) query.set("page", page);
    if (q.trim()) query.set("q", q.trim());
    if (source !== "comments") query.set("state", messengerState);
    try {
      const data = await json<{ items: Item[]; catalog: Catalog }>(`/api/inbox?${query}`);
      if (request !== listRequest.current) return;
      setListError(false);
      setItems(data.items);
      setCatalog(data.catalog);
    } catch {
      if (request === listRequest.current) setListError(true);
    }
  }, [source, account, page, q, messengerState]);

  useEffect(() => {
    const requests = listRequest;
    const timer = setTimeout(() => void load(), 220);
    return () => { clearTimeout(timer); ++requests.current; };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    json<Template[]>("/api/comments?view=templates")
      .then((rows) => setTemplates(rows.filter((item) => item.active)))
      .catch(() => {});
  }, []);

  async function open(item: Item) {
    const request = ++detailRequest.current;
    setSelected(item);
    setDetailError(false);
    setText("");
    setCommentDetail(null);
    setMessageDetail(null);
    try {
      if (item.kind === "comment") {
        const detail = await json<CommentDetail>(`/api/comments?id=${item.id}`);
        if (request === detailRequest.current) setCommentDetail(detail);
      } else {
        const detail = await json<MessengerDetail>(`/api/messages?id=${item.id}`);
        if (request === detailRequest.current) setMessageDetail(detail);
      }
    } catch {
      if (request === detailRequest.current) setDetailError(true);
    }
  }

  async function send() {
    if (!selected || !text.trim() || !canReply) return;
    setBusy(true);
    try {
      if (selected.kind === "comment") {
        const draft = await json<{ id: string }>("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "draft", id: selected.id, content: text.trim(), templateId: null }),
        });
        await json("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", id: selected.id, replyId: draft.id }),
        });
        await json("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "send", id: selected.id, replyId: draft.id }),
        });
        toast("أُرسل الرد على تعليق Facebook");
      } else {
        await json("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "reply", id: selected.id, text: text.trim() }),
        });
        toast("أُرسل الرد على Messenger");
      }
      setText("");
      await open(selected);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر إرسال الرد", "error");
    } finally {
      setBusy(false);
    }
  }

  async function updateMessenger(action: "state" | "unread", value: string | boolean) {
    if (!selected || selected.kind !== "messenger") return;
    setBusy(true);
    try {
      await json("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: selected.id, value }),
      });
      toast(action === "unread" ? (value ? "عُلّمت كغير مقروء" : "عُلّمت كمقروء") : value === "resolved" ? "تم حل المحادثة" : value === "archived" ? "أُرشفت المحادثة" : "أُعيد فتح المحادثة");
      await load();
      if (value === "archived") {
        setSelected(null);
        setMessageDetail(null);
      } else {
        const refreshed = items?.find((item) => item.kind === "messenger" && item.id === selected.id);
        if (refreshed) setSelected({ ...refreshed, state: String(value === true || value === false ? refreshed.state ?? "open" : value) });
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر تحديث المحادثة", "error");
    } finally {
      setBusy(false);
    }
  }

  async function resolveComment() {
    if (!selected || selected.kind !== "comment") return;
    setBusy(true);
    try {
      await json("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", ids: [selected.id], value: "resolved" }),
      });
      toast("تم حل التعليق");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر تحديث التعليق", "error");
    } finally {
      setBusy(false);
    }
  }

  const canSend = selected?.kind === "messenger"
    ? Boolean(messageDetail?.conversation.canReply)
    : Boolean(selected?.kind === "comment" && commentDetail);

  return <div className={`inbox ${selected ? "has-selection" : ""}`}>
    <section className="inbox-list" aria-label="الوارد الموحد">
      <nav className="tabs" role="tablist">
        {([["all", "الكل"], ["comments", "التعليقات"], ["messenger", "Messenger"]] as Array<[Source, string]>).map(([key, label]) =>
          <button key={key} role="tab" aria-selected={source === key} className={source === key ? "active" : ""} onClick={() => { setSource(key); setSelected(null); }}>{label}</button>
        )}
      </nav>

      {(catalog.accounts.length > 1 || catalog.pages.length > 1) && <div className="search row">
        {catalog.accounts.length > 1 && <select aria-label="حساب Meta" value={account} onChange={(e) => { setAccount(e.target.value); setPage(""); }}><option value="">كل الحسابات</option>{catalog.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        {catalog.pages.length > 1 && <select aria-label="الصفحة" value={page} onChange={(e) => setPage(e.target.value)}><option value="">كل الصفحات</option>{visiblePages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      </div>}

      <div className="search row">
        <input type="search" aria-label="بحث في صندوق الوارد" placeholder="ابحث بالاسم أو الرسالة…" value={q} onChange={(e) => setQ(e.target.value)} />
        {source !== "comments" && <select aria-label="حالة Messenger" value={messengerState} onChange={(e) => setMessengerState(e.target.value)}>
          <option value="active">Messenger النشط</option>
          <option value="unread">غير المقروء</option>
          <option value="archived">المؤرشف</option>
          <option value="all">كل Messenger</option>
        </select>}
      </div>

      <div className="inbox-items">
        {listError && <div role="alert" style={{ padding: 16 }}><p>تعذر تحديث صندوق الوارد. البيانات الظاهرة قد لا تكون محدثة.</p><button className="btn btn-secondary btn-sm" onClick={() => void load()}>إعادة المحاولة</button></div>}
        {items === null ? (listError ? null : <div style={{ padding: 16 }}><Skeleton lines={5} /></div>) : !items.length
          ? (listError ? null : <EmptyState icon="inbox" title="لا توجد محادثات" description="لا توجد تعليقات أو رسائل مطابقة للفلاتر الحالية." />)
          : items.map((item) => <button key={`${item.kind}:${item.id}`} className={`inbox-item ${selected?.kind === item.kind && selected.id === item.id ? "active" : ""} ${item.unread ? "unread" : ""}`} onClick={() => void open(item)}>
              <span className="avatar" style={{ width: 32, height: 32 }}>{item.person.slice(0, 1)}</span>
              <span className="row-between"><b>{item.person}</b><small>{riyadh(item.occurredAt, "time")}</small></span>
              <p className="clamp-2">{item.preview || "(مرفق)"}</p>
              <small><span className={`badge ${item.kind === "messenger" ? "badge-success" : "badge-info"}`}>{item.kind === "messenger" ? "Messenger" : "تعليق"}</span> · {item.pageName}{item.needsReply && <> · <b>يحتاج رد</b></>}</small>
            </button>)}
      </div>
    </section>

    <section className="inbox-thread" aria-label="المحادثة">
      {!selected ? <EmptyState icon="inbox" title="اختر محادثة" description="التعليقات ورسائل Messenger تظهر هنا في مكان واحد." /> : <>
        <header>
          <div className="row">
            <button className="btn btn-ghost btn-sm mobile-only" onClick={() => setSelected(null)}>رجوع</button>
            <b style={{ color: "var(--heading)" }}>{selected.person}</b>
            <span className={`badge ${selected.kind === "messenger" ? "badge-success" : "badge-info"}`}>{selected.kind === "messenger" ? "Messenger" : "Facebook Comment"}</span>
            <small>{selected.pageName}</small>
          </div>
          {selected.kind === "comment" && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resolveComment}><Icon name="check" width={14} />تم الحل</button>}
          {selected.kind === "messenger" && <div className="row">
            {selected.state === "resolved"
              ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => updateMessenger("state", "open")}>إعادة فتح</button>
              : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => updateMessenger("state", "resolved")}><Icon name="check" width={14} />تم الحل</button>}
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateMessenger("unread", !selected.unread)}>{selected.unread ? "مقروء" : "غير مقروء"}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateMessenger("state", "archived")}>أرشفة</button>
          </div>}
        </header>

        <div className="inbox-messages">
          {detailError && <div role="alert"><p>تعذر تحميل المحادثة.</p><button className="btn btn-secondary btn-sm" onClick={() => void open(selected)}>إعادة المحاولة</button></div>}
          {selected.kind === "comment" && !commentDetail && !detailError && <Skeleton lines={4} />}
          {selected.kind === "comment" && commentDetail && <>
            {commentDetail.thread.filter((row) => row.id !== commentDetail.comment.id).map((row) => <div className="bubble" key={row.id}><p className="pre">{row.message}</p><small>{row.author_name ?? "متابع"} · {riyadh(row.created_time, "time")}</small></div>)}
            <div className="bubble"><p className="pre">{commentDetail.comment.message}</p><small>{riyadh(commentDetail.comment.created_time)}</small></div>
            {commentDetail.replies.map((row) => <div className="bubble outgoing" key={row.id}><p className="pre">{row.content}</p><small>{row.status} · {row.reply_type}</small></div>)}
          </>}
          {selected.kind === "messenger" && !messageDetail && !detailError && <Skeleton lines={4} />}
          {selected.kind === "messenger" && messageDetail?.messages.map((row) => <div className={`bubble ${row.is_from_page ? "outgoing" : ""}`} key={row.id}><p className="pre">{row.message || "(مرفق)"}</p><small>{riyadh(row.created_time)}{row.sent_by ? ` · ${row.sent_by}` : ""}</small></div>)}
        </div>

        {canReply && <div className="reply-composer">
          {templates.length > 0 && <div className="chips">{templates.slice(0, 6).map((item) => <button key={item.id} type="button" className="chip" onClick={() => setText(item.content)}>{item.name}</button>)}</div>}
          {selected.kind === "messenger" && messageDetail && !messageDetail.conversation.canReply && <small className="muted">انتهت نافذة الرد المسموحة؛ انتظر رسالة جديدة من العميل.</small>}
          <textarea aria-label="نص الرد" placeholder="اكتب الرد…" value={text} disabled={!canSend} onChange={(e) => setText(e.target.value)} />
          <div className="row-between"><small>{selected.kind === "messenger" ? "الرد عبر Messenger" : "الرد على تعليق Facebook"}</small><button className="btn btn-primary btn-sm" disabled={busy || !text.trim() || !canSend} onClick={send}><Icon name="send" width={14} />إرسال</button></div>
        </div>}
      </>}
    </section>

    <aside className="inbox-context" aria-label="معلومات المحادثة">
      {!selected ? <small>اختر محادثة لعرض التفاصيل.</small> : <>
        <div className="stack" style={{ gap: 6 }}><small className="section-title">المصدر</small><span>{selected.kind === "messenger" ? "Facebook Messenger" : "تعليقات Facebook"}</span></div>
        <div className="stack" style={{ gap: 6 }}><small className="section-title">الصفحة</small><span>{selected.pageName}</span></div>
        <div className="stack" style={{ gap: 6 }}><small className="section-title">آخر نشاط</small><span>{riyadh(selected.occurredAt)}</span></div>
        <div className="stack" style={{ gap: 6 }}><small className="section-title">الحالة</small><span className={`badge ${selected.needsReply ? "badge-warning" : "badge-success"}`}>{selected.kind === "messenger" ? (selected.state === "resolved" ? "محلولة" : selected.state === "archived" ? "مؤرشفة" : selected.unread ? "غير مقروءة" : "مفتوحة") : selected.needsReply ? "بحاجة رد" : "متابع"}</span></div>
      </>}
    </aside>
  </div>;
}

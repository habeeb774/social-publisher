"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { confirmDialog, toast } from "../ui/feedback";
import { Icon } from "../ui/icons";
import { Skeleton } from "../ui/kit";
import { inboxJson as json } from "./inbox-request";
import { commentReplyFlow, savedCommentReply } from "./comment-reply-flow";
import { refreshCurrentSelection } from "./selection-refresh";
import { draftAfterOpening } from "./reply-draft";
import { confirmCurrentSelection } from "./selection-confirmation";
import { convertMessengerLead } from "./messages/lead-conversion";
import Link from "next/link";

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

export function UnifiedInboxClient({ canReply,canCreateLead=false,canManageInbox=false,canApproveComments=false,initialSource='all',initialQuery='' }: { canReply: boolean;canCreateLead?:boolean;canManageInbox?:boolean;canApproveComments?:boolean;initialSource?:Source;initialQuery?:string }) {
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
  const [convertedLead, setConvertedLead] = useState<{ conversationId: string; id: string } | null>(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const replyAction = useRef(false);
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

  async function open(item: Item, clearDraft = false) {
    const request = ++detailRequest.current;
    setSelected(item);
    setDetailError(false);
    setText(current => draftAfterOpening(selected, item, current, clearDraft));
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
    if (!selected || !text.trim() || !canReply || busy || replyAction.current) return;
    if (selected.kind === "messenger" ? !messageDetail?.conversation.canReply : !commentDetail) return;
    const target = selected;
    const request = detailRequest.current;
    replyAction.current = true;
    setBusy(true);
    try {
      if (selected.kind === "comment") {
        const outcome = await commentReplyFlow((body) => json("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }), selected.id, text, canApproveComments);
        toast(outcome === "sent" ? "أُرسل الرد على تعليق Facebook" : outcome === "draft" ? "حُفظت مسودة الرد؛ تحتاج اعتماد المسؤول قبل الإرسال." : "حُفظ الرد المعتمد، لكن الإرسال الفعلي غير مفعّل. لم يُرسل إلى Facebook.");
      } else {
        await json("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "reply", id: selected.id, text: text.trim() }),
        });
        toast("أُرسل الرد على Messenger");
      }
      await refreshCurrentSelection(request, () => detailRequest.current, () => open(target, true));
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر إرسال الرد", "error");
    } finally {
      replyAction.current = false;
      setBusy(false);
    }
  }

  async function reviewReply(reply: { id: string; status: string }, action: "approve" | "send") {
    if (!selected || selected.kind !== "comment" || !canReply || busy || replyAction.current || (action === "approve" && !canApproveComments)) return;
    const target = selected;
    const request = detailRequest.current;
    replyAction.current = true;
    setBusy(true);
    let attempted = false;
    try {
      if (action === "send" && !await confirmCurrentSelection(request, () => detailRequest.current, () => confirmDialog({
        title: "إرسال الرد المعتمد؟",
        message: `سيُرسل الرد إلى تعليق ${target.person} على صفحة ${target.pageName}. لا يمكن التراجع عن الإرسال من هنا.`,
        confirmLabel: "إرسال إلى Facebook",
      }))) return;
      attempted = true;
      const outcome = await savedCommentReply((body) => json("/api/comments", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }), target.id, reply, action);
      toast(outcome === "approved" ? "اعتُمد الرد دون إرسال." : outcome === "sent" ? "أُرسل الرد إلى Facebook." : "الإرسال الفعلي غير مفعّل. لم يُرسل الرد إلى Facebook.");
    } catch {
      toast("تعذر تأكيد الإجراء. راجع حالة الرد قبل إعادة المحاولة.", "error");
    } finally {
      if (attempted) {
        await refreshCurrentSelection(request, () => detailRequest.current, () => open(target));
        await load();
      }
      replyAction.current = false;
      setBusy(false);
    }
  }

  async function updateMessenger(action: "state" | "unread", value: string | boolean) {
    if (!selected || selected.kind !== "messenger" || !canManageInbox || busy || replyAction.current) return;
    const target = selected;
    const request = detailRequest.current;
    replyAction.current = true;
    setBusy(true);
    try {
      await json("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id: target.id, value }),
      });
      toast(action === "unread" ? (value ? "عُلّمت كغير مقروء" : "عُلّمت كمقروء") : value === "resolved" ? "تم حل المحادثة" : value === "archived" ? "أُرشفت المحادثة" : "أُعيد فتح المحادثة");
      await load();
      if (request !== detailRequest.current) return;
      if (value === "archived") {
        ++detailRequest.current;
        setSelected(null);
        setMessageDetail(null);
      } else {
        setSelected({ ...target, ...(action === "unread" ? { unread: Boolean(value) } : { state: String(value) }) });
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر تحديث المحادثة", "error");
    } finally {
      replyAction.current = false;
      setBusy(false);
    }
  }

  async function resolveComment() {
    if (!selected || selected.kind !== "comment" || !canApproveComments || busy || replyAction.current) return;
    replyAction.current = true;
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
      replyAction.current = false;
      setBusy(false);
    }
  }

  async function convertLead() {
    if (!canCreateLead || !selected || selected.kind !== "messenger" || !messageDetail || busy || replyAction.current) return;
    const target = selected;
    const request = detailRequest.current;
    replyAction.current = true;
    setBusy(true);
    try {
      const id = await convertMessengerLead(target.id);
      if (request === detailRequest.current) {
        setConvertedLead({ conversationId: target.id, id });
        toast("المحادثة مرتبطة بعميل محتمل. يمكنك فتح ملفه الآن.");
      }
    } catch {
      toast("تعذر تأكيد التحويل. راجع قائمة العملاء المحتملين قبل المحاولة مجددًا.", "error");
    } finally {
      replyAction.current = false;
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
          <button key={key} role="tab" aria-selected={source === key} className={source === key ? "active" : ""} onClick={() => { ++detailRequest.current; setSource(key); setSelected(null); setCommentDetail(null); setMessageDetail(null); setText(""); }}>{label}</button>
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
            <button className="btn btn-ghost btn-sm mobile-only" onClick={() => { ++detailRequest.current; setSelected(null); setCommentDetail(null); setMessageDetail(null); setText(""); }}>رجوع</button>
            <b style={{ color: "var(--heading)" }}>{selected.person}</b>
            <span className={`badge ${selected.kind === "messenger" ? "badge-success" : "badge-info"}`}>{selected.kind === "messenger" ? "Messenger" : "Facebook Comment"}</span>
            <small>{selected.pageName}</small>
          </div>
          {canApproveComments && selected.kind === "comment" && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={resolveComment}><Icon name="check" width={14} />تم الحل</button>}
          {canManageInbox && selected.kind === "messenger" && <div className="row">
            {selected.state === "resolved"
              ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => updateMessenger("state", "open")}>إعادة فتح</button>
              : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => updateMessenger("state", "resolved")}><Icon name="check" width={14} />تم الحل</button>}
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateMessenger("unread", !selected.unread)}>{selected.unread ? "مقروء" : "غير مقروء"}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => updateMessenger("state", "archived")}>أرشفة</button>
          </div>}
        </header>
        {canCreateLead && selected.kind === "messenger" && <div className="row" style={{ padding: 12, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !messageDetail} onClick={() => void convertLead()}>تحويل إلى عميل محتمل</button>
          {convertedLead?.conversationId === selected.id && <Link className="btn btn-primary btn-sm" href={`/leads/${convertedLead.id}`}>فتح ملف العميل المحتمل</Link>}
        </div>}

        <div className="inbox-messages">
          {detailError && <div role="alert"><p>تعذر تحميل المحادثة.</p><button className="btn btn-secondary btn-sm" onClick={() => void open(selected)}>إعادة المحاولة</button></div>}
          {selected.kind === "comment" && !commentDetail && !detailError && <Skeleton lines={4} />}
          {selected.kind === "comment" && commentDetail && <>
            {commentDetail.thread.filter((row) => row.id !== commentDetail.comment.id).map((row) => <div className="bubble" key={row.id}><p className="pre">{row.message}</p><small>{row.author_name ?? "متابع"} · {riyadh(row.created_time, "time")}</small></div>)}
            <div className="bubble"><p className="pre">{commentDetail.comment.message}</p><small>{riyadh(commentDetail.comment.created_time)}</small></div>
            {commentDetail.replies.map((row) => <div className="bubble outgoing" key={row.id}><p className="pre">{row.content}</p><small>{{ draft: "مسودة", pending_approval: "بانتظار الاعتماد", approved: "معتمد", sending: "جارٍ الإرسال", sent: "أُرسل", failed: "فشل الإرسال", outcome_unknown: "نتيجة الإرسال غير مؤكدة" }[row.status] ?? "حالة غير معروفة"}</small>
              {canApproveComments && ["draft", "pending_approval"].includes(row.status) && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void reviewReply(row, "approve")}>اعتماد دون إرسال</button>}
              {canReply && row.status === "approved" && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void reviewReply(row, "send")}>إرسال الرد المعتمد</button>}
              {row.status === "outcome_unknown" && <p>تحقق من التعليق على Facebook قبل أي إعادة إرسال لتجنب التكرار.</p>}
            </div>)}
          </>}
          {selected.kind === "messenger" && !messageDetail && !detailError && <Skeleton lines={4} />}
          {selected.kind === "messenger" && messageDetail?.messages.map((row) => <div className={`bubble ${row.is_from_page ? "outgoing" : ""}`} key={row.id}><p className="pre">{row.message || "(مرفق)"}</p><small>{riyadh(row.created_time)}{row.sent_by ? ` · ${row.sent_by}` : ""}</small></div>)}
        </div>

        {canReply && <div className="reply-composer">
          {templates.length > 0 && <div className="chips">{templates.slice(0, 6).map((item) => <button key={item.id} type="button" className="chip" disabled={busy || !canSend} onClick={() => setText(item.content)}>{item.name}</button>)}</div>}
          {selected.kind === "messenger" && messageDetail && !messageDetail.conversation.canReply && <small className="muted">انتهت نافذة الرد المسموحة؛ انتظر رسالة جديدة من العميل.</small>}
          <textarea aria-label="نص الرد" placeholder="اكتب الرد…" value={text} disabled={busy || !canSend} onChange={(e) => setText(e.target.value)} />
          <div className="row-between"><small>{selected.kind === "messenger" ? "الرد عبر Messenger" : canApproveComments ? "الرد على تعليق Facebook" : "مسودة تحتاج اعتماد المسؤول"}</small><button className="btn btn-primary btn-sm" disabled={busy || !text.trim() || !canSend} onClick={send}><Icon name="send" width={14} />{selected.kind === "comment" && !canApproveComments ? "حفظ مسودة" : "إرسال"}</button></div>
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

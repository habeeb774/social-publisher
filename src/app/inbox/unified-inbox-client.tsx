"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { toast } from "../ui/feedback";
import { Icon } from "../ui/icons";
import { Skeleton } from "../ui/kit";

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

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? data.code ?? "تعذر التنفيذ");
  return data as T;
}

export function UnifiedInboxClient({ canReply }: { canReply: boolean }) {
  const [source, setSource] = useState<Source>("all");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ accounts: [], pages: [] });
  const [selected, setSelected] = useState<Item | null>(null);
  const [commentDetail, setCommentDetail] = useState<CommentDetail | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessengerDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const visiblePages = useMemo(
    () => catalog.pages.filter((item) => !account || item.account_id === account),
    [catalog.pages, account],
  );

  const load = useCallback(async () => {
    const query = new URLSearchParams({ source });
    if (account) query.set("account", account);
    if (page) query.set("page", page);
    if (q.trim()) query.set("q", q.trim());
    try {
      const data = await json<{ items: Item[]; catalog: Catalog }>(`/api/inbox?${query}`);
      setItems(data.items);
      setCatalog(data.catalog);
      if (selected && !data.items.some((item) => item.kind === selected.kind && item.id === selected.id)) {
        setSelected(null);
        setCommentDetail(null);
        setMessageDetail(null);
      }
    } catch (error) {
      setItems([]);
      toast(error instanceof Error ? error.message : "تعذر تحميل صندوق الوارد", "error");
    }
  }, [source, account, page, q, selected]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 220);
    return () => clearTimeout(timer);
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
    setSelected(item);
    setText("");
    setCommentDetail(null);
    setMessageDetail(null);
    try {
      if (item.kind === "comment") {
        setCommentDetail(await json<CommentDetail>(`/api/comments?id=${item.id}`));
      } else {
        setMessageDetail(await json<MessengerDetail>(`/api/messages?id=${item.id}`));
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "تعذر فتح المحادثة", "error");
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
    : Boolean(selected?.kind === "comment");

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

      <div className="search"><input type="search" aria-label="بحث في صندوق الوارد" placeholder="ابحث بالاسم أو الرسالة…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="inbox-items">
        {items === null ? <div style={{ padding: 16 }}><Skeleton lines={5} /></div> : !items.length
          ? <EmptyState icon="inbox" title="لا توجد محادثات" description="لا توجد تعليقات أو رسائل مطابقة للفلاتر الحالية." />
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
        </header>

        <div className="inbox-messages">
          {selected.kind === "comment" && !commentDetail && <Skeleton lines={4} />}
          {selected.kind === "comment" && commentDetail && <>
            {commentDetail.thread.filter((row) => row.id !== commentDetail.comment.id).map((row) => <div className="bubble" key={row.id}><p className="pre">{row.message}</p><small>{row.author_name ?? "متابع"} · {riyadh(row.created_time, "time")}</small></div>)}
            <div className="bubble"><p className="pre">{commentDetail.comment.message}</p><small>{riyadh(commentDetail.comment.created_time)}</small></div>
            {commentDetail.replies.map((row) => <div className="bubble outgoing" key={row.id}><p className="pre">{row.content}</p><small>{row.status} · {row.reply_type}</small></div>)}
          </>}
          {selected.kind === "messenger" && !messageDetail && <Skeleton lines={4} />}
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
        <div className="stack" style={{ gap: 6 }}><small className="section-title">الحالة</small><span className={`badge ${selected.needsReply ? "badge-warning" : "badge-success"}`}>{selected.needsReply ? "بحاجة رد" : "متابع"}</span></div>
      </>}
    </aside>
  </div>;
}

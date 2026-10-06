"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { riyadh } from "../ui/api";
import { EmptyState } from "../ui/empty-state";
import { toast } from "../ui/feedback";
import { Icon } from "../ui/icons";
import { Skeleton } from "../ui/kit";

type Comment = { id: string; message: string; author_name: string | null; page_name: string; post_id: string | null; created_time: string; status: string; sentiment: string; needs_reply: boolean; facebook_comment_id?: string };
type Reply = { id: string; content: string; status: string; reply_type: string; created_at: string };
type Detail = { comment: Comment; thread: Comment[]; replies: Reply[]; notes: Array<{ id: string; body: string; author: string; created_at?: string }>; tags: Array<{ id: string; name: string }>; post: { id: string; content: string; campaign_name: string | null } | null };
type Caps = { connected: boolean; read: boolean; reply: boolean; hide?: boolean; reason: string | null; flags?: { replies: boolean; autoReplies?: boolean; automation?: boolean } };
type Template = { id: string; name: string; content: string; active: boolean };
const TABS: Array<[string, string]> = [["all", "الكل"], ["unread", "غير مقروء"], ["needs_reply", "بحاجة رد"], ["replied", "تم الرد"], ["important", "مهم"], ["spam", "مزعج"]];
const SENTIMENT: Record<string, string> = { complaint: "مراجعة بشرية", price: "استفسار سعر", purchase: "رغبة شراء", question: "سؤال", positive: "إيجابي", neutral: "محايد" };
const REPLY_STATUS: Record<string, string> = { draft: "مسودة", approved: "معتمد", pending_approval: "بانتظار الموافقة", sent: "أُرسل", failed: "فشل", sending: "جارٍ الإرسال", outcome_unknown: "نتيجة غير مؤكدة — تحقق من Facebook" };

async function call<T>(query: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/comments${query}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? d.code ?? "تعذر الاتصال");
  return d as T;
}

/** Three-column inbox (RTL): conversations | thread + reply | post & customer context. */
export function InboxClient({ canReply }: { canReply: boolean }) {
  const params = useSearchParams();
  const [tab, setTab] = useState("needs_reply");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Comment[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState("");
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);

  const loadList = useCallback(async (next?: string) => {
    try { const r = await call<{ items: Comment[]; nextCursor: string | null }>(`?status=${tab}&q=${encodeURIComponent(q)}${page ? `&page=${page}` : ""}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`); setItems((old) => next ? [...(old ?? []), ...r.items] : r.items); setCursor(r.nextCursor); }
    catch (e) { setItems([]); toast(e instanceof Error ? e.message : "تعذر تحميل التعليقات", "error"); }
  }, [tab, q, page]);
  useEffect(() => { const t = setTimeout(() => loadList(), 250); return () => clearTimeout(t); }, [loadList]);
  useEffect(() => { call<Caps>("?view=capabilities").then(setCaps).catch(() => setCaps({ connected: false, read: false, reply: false, reason: "COMMENTS_AUTH_REQUIRED" })); call<{ pages: Array<{ id: string; name: string }> }>("?view=catalog").then((d) => setPages(d.pages ?? [])).catch(() => {}); call<Template[]>("?view=templates").then((t) => setTemplates(t.filter((x) => x.active))).catch(() => {}); }, []);
  const open = useCallback(async (id: string) => { try { setDetail(await call<Detail>(`?id=${id}`)); setDraft(""); setTemplateId(null); } catch (e) { toast(e instanceof Error ? e.message : "تعذر فتح المحادثة", "error"); } }, []);
  useEffect(() => { const id = params.get("id"); if (!id) return; const t = setTimeout(() => open(id), 0); return () => clearTimeout(t); }, [params, open]);

  async function mutate(body: unknown, success: string) {
    setBusy(true);
    try { await call("", body); toast(success); await loadList(); if (detail) await open(detail.comment.id); } catch (e) { toast(e instanceof Error ? e.message : "تعذر التنفيذ", "error"); } finally { setBusy(false); }
  }
  const sync = () => { const now = new Date(); mutate({ action: "sync", from: new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }, "اكتملت المزامنة"); };
  const c = detail?.comment;
  async function sendNow() {
    if (!c || !draft.trim()) return;
    if (!caps?.reply || !caps.flags?.replies) {
      toast("الرد الحقيقي غير متاح حاليًا", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await call<Reply>("", { action: "draft", id: c.id, content: draft, templateId });
      await call("", { action: "approve", id: c.id, replyId: created.id });
      await call("", { action: "send", id: c.id, replyId: created.id });
      toast("أُرسل الرد إلى Facebook");
      setDraft("");
      setTemplateId(null);
      await loadList();
      await open(c.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر إرسال الرد", "error");
    } finally {
      setBusy(false);
    }
  }


  return <>
    {caps && <div className={`alert ${caps.reply && caps.flags?.replies ? "alert-success" : "alert-info"}`} role="note"><Icon name="inbox" width={16} /><span><b>القراءة {caps.read ? "متاحة" : "غير متاحة"} · الرد اليدوي {caps.reply && caps.flags?.replies ? "مفعّل" : "غير متاح"} · الرد التلقائي {caps.flags?.automation && caps.flags?.autoReplies && caps.flags?.replies ? "مفعّل" : "متوقف"}</b>{caps.reason ? ` (${caps.reason})` : ""}</span></div>}
    <div className={`inbox ${detail ? "has-selection" : ""}`}>
      <section className="inbox-list" aria-label="المحادثات">
        <nav className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
        {pages.length > 1 && <div className="search"><select aria-label="الصفحة" value={page} onChange={(e) => setPage(e.target.value)}><option value="">كل الصفحات</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        <div className="search row"><input type="search" aria-label="بحث في التعليقات" placeholder="ابحث بالنص أو الاسم…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-icon" aria-label="جلب تعليقات آخر يومين" data-tooltip="مزامنة آخر يومين" disabled={busy || !caps?.read} onClick={sync}><Icon name="recycle" width={16} /></button></div>
        <div className="inbox-items">{items === null ? <div style={{ padding: 16 }}><Skeleton lines={4} /></div> : !items.length ? <EmptyState icon="inbox" title="لا توجد محادثات" description={tab === "needs_reply" ? "لا توجد تعليقات بانتظار الرد." : "جرّب تبويبًا آخر أو امسح البحث."} /> :
          items.map((i) => <button key={i.id} className={`inbox-item ${detail?.comment.id === i.id ? "active" : ""} ${i.status === "unread" || i.status === "new" ? "unread" : ""}`} onClick={() => open(i.id)}><span className="avatar" style={{ width: 32, height: 32 }}>{(i.author_name ?? "؟").slice(0, 1)}</span><span className="row-between"><b>{i.author_name ?? "متابع"}</b><small className="num">{riyadh(i.created_time, "time")}</small></span><p className="clamp-2">{i.message}</p><small><span className="badge badge-info">{i.page_name}</span>{i.sentiment !== "neutral" && <> · <span className={i.sentiment === "complaint" ? "danger" : ""}>{SENTIMENT[i.sentiment] ?? i.sentiment}</span></>}</small></button>)}
          {cursor && <div style={{ padding: 12 }}><button className="btn btn-secondary btn-sm block" onClick={() => loadList(cursor)}>تحميل المزيد</button></div>}</div>
      </section>

      <section className="inbox-thread" aria-label="المحادثة">
        {!c ? <EmptyState icon="inbox" title="اختر محادثة" description="تظهر هنا تفاصيل التعليق والردود والملاحظات." /> : <>
          <header><div className="row"><button className="btn btn-ghost btn-sm mobile-only" onClick={() => setDetail(null)}>رجوع</button><b style={{ color: "var(--heading)" }}>{c.author_name ?? "متابع"}</b><small>{riyadh(c.created_time)}</small></div>
            <div className="row"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => mutate({ action: "status", ids: [c.id], value: "important" }, "عُلّم كمهم")}>مهم</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => mutate({ action: "status", ids: [c.id], value: "resolved" }, "تم الحل")}><Icon name="check" width={14} />تم</button><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => mutate({ action: "status", ids: [c.id], value: "spam" }, "نُقل إلى المزعج")}>مزعج</button>{canReply && caps?.hide && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => mutate({ action: c.status === "hidden" ? "unhide" : "hide", id: c.id }, c.status === "hidden" ? "أُظهر التعليق على Facebook" : "أُخفي التعليق على Facebook")}>{c.status === "hidden" ? "إظهار" : "إخفاء"}</button>}</div></header>
          <div className="inbox-messages">
            {detail!.thread.filter((t) => t.id !== c.id).map((t) => <div key={t.id} className="bubble"><p className="pre">{t.message}</p><small>{t.author_name ?? "متابع"} · {riyadh(t.created_time, "time")}</small></div>)}
            <div className="bubble"><p className="pre">{c.message}</p><small>{riyadh(c.created_time)}{c.sentiment === "complaint" && <> · <b className="danger">يحتاج مراجعة بشرية</b></>}</small></div>
            {detail!.replies.map((r) => <div key={r.id} className="bubble outgoing"><p className="pre">{r.content}</p><small>{REPLY_STATUS[r.status] ?? r.status} · {r.reply_type === "automation" ? "تلقائي" : r.reply_type === "template" ? "قالب" : "يدوي"}{r.status === "draft" && canReply && <> · <button className="link-button" onClick={() => mutate({ action: "approve", id: c.id, replyId: r.id }, "اعتُمد الرد")}>اعتماد</button></>}{(r.status === "approved" || r.status === "failed") && canReply && caps?.reply && (caps.flags?.replies ? <> · <button className="link-button" disabled={busy} onClick={() => mutate({ action: "send", id: c.id, replyId: r.id }, "أُرسل الرد إلى Facebook")}>إرسال إلى Facebook</button></> : <> · <span className="muted">الإرسال الحقيقي مطفأ</span></>)}</small></div>)}
            {detail!.notes.map((n) => <div key={n.id} className="bubble note"><p className="pre">{n.body}</p><small>ملاحظة داخلية · {n.author}</small></div>)}
          </div>
          {canReply && <div className="reply-composer">
            {templates.length > 0 && <div className="chips">{templates.slice(0, 6).map((t) => <button key={t.id} type="button" className="chip" onClick={() => { setDraft(t.content); setTemplateId(t.id); }}>{t.name}</button>)}</div>}
            <textarea aria-label="نص الرد" placeholder={caps?.reply ? "اكتب ردك…" : "اكتب ردك، ثم انسخه وافتح التعليق في Facebook…"} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="row-between"><small><Icon name="ideas" width={12} /> اقتراح ذكي: يتوفر عند تفعيل المساعد الذكي</small><div className="row">
              <button className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} onClick={() => mutate({ action: "draft", id: c.id, content: draft, templateId }, "حُفظت المسودة")}>حفظ كمسودة</button>
              {caps?.reply && caps.flags?.replies
                ? <button className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={sendNow}><Icon name="send" width={14} />إرسال إلى Facebook</button>
                : <button className="btn btn-primary btn-sm" disabled={!draft.trim() || !c.facebook_comment_id} title="ينسخ الرد ويفتح التعليق في Facebook" onClick={() => { navigator.clipboard?.writeText(draft).then(() => toast("نُسخ الرد — الصقه في Facebook وأرسله"), () => toast("تعذر النسخ؛ انسخ النص يدويًا", "error")); window.open(`https://www.facebook.com/${c.facebook_comment_id}`, "_blank", "noopener"); mutate({ action: "draft", id: c.id, content: draft, templateId }, "حُفظ الرد في السجل"); }}><Icon name="send" width={14} />نسخ وفتح في Facebook</button>}</div></div>
            <form className="inline-field" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { mutate({ action: "note", id: c.id, value: note }, "أُضيفت الملاحظة"); setNote(""); } }}><input aria-label="ملاحظة داخلية" placeholder="ملاحظة داخلية للفريق…" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn btn-ghost btn-sm" disabled={!note.trim()}>إضافة ملاحظة</button></form>
          </div>}
        </>}
      </section>

      <aside className="inbox-context" aria-label="معلومات المنشور والمتابع">
        {!c ? <small>تفاصيل المنشور والمتابع تظهر هنا.</small> : <>
          <div className="stack" style={{ gap: 6 }}><small className="section-title">المتابع</small><div className="row"><span className="avatar">{(c.author_name ?? "؟").slice(0, 1)}</span><b style={{ color: "var(--heading)" }}>{c.author_name ?? "غير متاح من الموصل"}</b></div></div>
          <div className="stack" style={{ gap: 6 }}><small className="section-title">التصنيف</small><div className="chips"><span className={`badge ${c.sentiment === "complaint" ? "badge-danger" : "badge-neutral"}`}>{SENTIMENT[c.sentiment] ?? c.sentiment}</span>{detail!.tags.map((t) => <span key={t.id} className="chip">{t.name}</span>)}</div></div>
          <div className="stack" style={{ gap: 6 }}><small className="section-title">المنشور</small>{detail!.post ? <Link href={`/posts/${detail!.post.id}`} className="card" style={{ padding: 12, textDecoration: "none" }}><span className="clamp-2" style={{ color: "var(--heading)", WebkitLineClamp: 4 }}>{detail!.post.content}</span>{detail!.post.campaign_name && <small>حملة: {detail!.post.campaign_name}</small>}</Link> : <small>{c.post_id ? <>منشور Facebook <code>{c.post_id}</code></> : "غير مرتبط بمنشور في النظام"}</small>}</div>
          <div className="stack" style={{ gap: 6 }}><small className="section-title">الصفحة</small><span>{c.page_name}</span></div>
        </>}
      </aside>
    </div>
  </>;
}

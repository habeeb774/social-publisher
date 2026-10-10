"use client";
import { BestTimesHint } from "./best-times-hint";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isoToRiyadhInput, riyadhInputToIso } from "@/services/post-time";
import { POST_CATEGORIES } from "@/services/catalog";
import { AppShell } from "../ui/app-shell";
import { ago, api } from "../ui/api";
import { confirmDialog, toast } from "../ui/feedback";
import { HelpTip, HELP } from "../ui/help-tip";
import { Icon } from "../ui/icons";
import { AiAssist } from "./ai-assist";
import { TEXT_HOOK_POSTS } from "@/content/text-hook-posts";

export type EditorPost = { id: string; pageId: string; content: string; scheduledAt: string | null; updatedAt: string; status: string; category?: string | null; tags?: string[]; campaignId?: string | null; imageUrl?: string | null };
type Option = { id: string; name: string };
type PageOption = Option & { accountId: string | null; accountName: string | null; platform: string };
type Check = { key: string; label: string; ok: boolean; critical: boolean; detail?: string };
type Intent = "draft" | "queue" | "scheduled" | "now";
const AUTOSAVE_MS = 6000;

export default function PostEditor({ initial, pages, publishingEnabled, campaigns = [], media = [], hashtags = [], templates = [], approvalRequired = false, aiEnabled = false, uploadEnabled = false, prefill }: {
  initial?: EditorPost; pages: PageOption[]; publishingEnabled: boolean; campaigns?: Option[]; media?: Array<{ id: string; name: string; url: string }>; hashtags?: Array<{ tag: string; uses: number }>;
  templates?: Array<{ id: string; name: string; content: string }>; approvalRequired?: boolean; aiEnabled?: boolean; uploadEnabled?: boolean; prefill?: { content?: string; imageUrl?: string; category?: string; tags?: string[] };
}) {
  const router = useRouter();
  const [post, setPost] = useState<{ id: string; updatedAt: string; status: string } | null>(initial ? { id: initial.id, updatedAt: initial.updatedAt, status: initial.status } : null);
  const [body, setBody] = useState(initial?.content ?? prefill?.content ?? "");
  const initialLocal = isoToRiyadhInput(initial?.scheduledAt || null);
  const [date, setDate] = useState(initialLocal.slice(0, 10));
  const [time, setTime] = useState(initialLocal.slice(11, 16) || "20:00");
  const initialPageId = initial?.pageId || pages[0]?.id || "";
  const initialAccountId = pages.find((p) => p.id === initialPageId)?.accountId ?? pages.find((p) => p.accountId)?.accountId ?? "";
  const [accountId, setAccountId] = useState(initialAccountId);
  const [pageId, setPageId] = useState(initialPageId);
  const [category, setCategory] = useState(initial?.category ?? prefill?.category ?? "");
  const [tags, setTags] = useState((initial?.tags ?? prefill?.tags ?? []).join(" "));
  const [campaignId, setCampaignId] = useState(initial?.campaignId ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? prefill?.imageUrl ?? "");
  const [imageInfo, setImageInfo] = useState<{ name?: string; size?: number; type?: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<Intent | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, tick] = useState(0);
  const busy = useRef(false);
  const lastSaved = useRef(body);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editable = !post || ["draft", "scheduled", "pending_approval", "approved"].includes(post.status);
  const isDraft = !post || post.status === "draft";
  const page = pages.find((p) => p.id === pageId);
  const accountOptions = Array.from(new Map(
    pages.filter((p) => p.accountId && p.accountName).map((p) => [p.accountId!, { id: p.accountId!, name: p.accountName! }])
  ).values());
  const showAccountSelect = accountOptions.length > 1;
  const visiblePages = showAccountSelect && accountId ? pages.filter((p) => p.accountId === accountId) : pages;

  // Auto-grow the editor with its content.
  useLayoutEffect(() => { const el = textarea.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.max(220, el.scrollHeight + 2)}px`; }, [body]);

  // Debounced autosave for drafts only; scheduled posts change only on explicit save.
  useEffect(() => {
    if (!isDraft || !editable || body === lastSaved.current || !body.trim()) return;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (!post) {
          const created = await api<{ id: string; updatedAt: string; status: string }>("/api/posts", { method: "POST", body: { pageId, content: body, status: "draft", timezone: "Asia/Riyadh" } });
          setPost(created); window.history.replaceState(null, "", `/posts/${created.id}/edit`);
        } else {
          const saved = await api<{ updatedAt: string }>(`/api/posts/${post.id}/autosave`, { method: "POST", body: { content: body, updatedAt: post.updatedAt } });
          setPost({ ...post, updatedAt: new Date(saved.updatedAt).toISOString() });
        }
        lastSaved.current = body; setSavedAt(new Date()); setError("");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الحفظ التلقائي"); }
      finally { busy.current = false; }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [body, isDraft, editable, post, pageId]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);

  const scheduledIso = () => date && time ? riyadhInputToIso(`${date}T${time}`) : undefined;

  async function save(intent: Intent) {
    if (busy.current) return;
    setError(""); busy.current = true; setSaving(intent);
    try {
      const scheduledAt = scheduledIso();
      if (intent === "scheduled") {
        if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) throw new Error("حدد تاريخًا ووقتًا في المستقبل (توقيت الرياض)");
        const result = await api<{ items: Check[]; blocking: boolean }>("/api/posts/check", { method: "POST", body: { pageId, content: body, scheduledAt, imageUrl: imageUrl.trim() || null, postId: post?.id } });
        setChecks(result.items);
        if (result.blocking) throw new Error("أصلح العناصر المعلّمة في قائمة الفحص قبل الجدولة");
        const warnings = result.items.filter((i) => !i.ok);
        if (warnings.length && !await confirmDialog({ title: "متابعة الجدولة رغم التنبيهات؟", message: warnings.map((w) => `• ${w.label}${w.detail ? `: ${w.detail}` : ""}`).join("\n"), confirmLabel: "جدولة" })) return;
      }
      if (intent === "now" && !await confirmDialog({ title: "نشر الآن؟", message: publishingEnabled ? `سيُنشر على «${page?.name ?? "الصفحة"}» خلال دقيقة.` : "وضع الاختبار مفعّل: سيمر المنشور بخطوات النشر دون أن يظهر على الصفحة.", confirmLabel: "نشر الآن" })) return;
      const payload = { pageId, content: body, scheduledAt: intent === "scheduled" ? scheduledAt : scheduledAt, timezone: "Asia/Riyadh", status: intent === "scheduled" ? "scheduled" : "draft", category: category || null, tags: tags.split(/[\s,،]+/).filter(Boolean), campaignId: campaignId || null, imageUrl: imageUrl.trim() || null, updatedAt: post?.updatedAt };
      const result = await api<{ id: string }>(post ? `/api/posts/${post.id}` : "/api/posts", { method: post ? "PATCH" : "POST", body: payload });
      if (intent === "queue") await api(`/api/posts/${result.id}/queue`, { method: "POST" });
      if (intent === "now") await api(`/api/posts/${result.id}/publish-now`, { method: "POST" });
      toast(intent === "draft" ? "تم حفظ المسودة" : intent === "queue" ? "أُضيف إلى الطابور" : intent === "now" ? "سيُنشر خلال دقيقة" : approvalRequired ? "أُرسل للموافقة" : "تمت الجدولة");
      router.push(`/posts/${result.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الاتصال. تحقق من قائمة المنشورات قبل إعادة المحاولة."); }
    finally { busy.current = false; setSaving(null); }
  }

  async function upload(file: File) {
    setUploading(true); setError("");
    const form = new FormData(); form.append("file", file);
    try { const asset = await api<{ url: string; name: string; size: number; mimeType: string }>("/api/media", { method: "POST", body: form }); setImageUrl(asset.url); setImageInfo({ name: asset.name, size: asset.size, type: asset.mimeType }); toast("تم رفع الصورة"); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر رفع الصورة"); } finally { setUploading(false); }
  }
  const insertAtCursor = (text: string) => {
    const el = textarea.current; if (!el) { setBody((b) => `${b}${text}`); return; }
    const start = el.selectionStart ?? body.length, end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next); requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + text.length; });
  };
  const addTag = (tag: string) => setTags((t) => t.split(/\s+/).includes(tag) ? t : `${t} ${tag}`.trim());
  const urls = Array.from(new Set(body.match(/https?:\/\/[^\s]+/g) ?? []));
  const hashtagsInText = Array.from(new Set(body.match(/#[\p{L}\p{N}_]+/gu) ?? []));
  const saveStatus = !isDraft ? "التغييرات تُحفظ عند الضغط على حفظ" : savedAt ? `تم الحفظ ${ago(savedAt)}` : post ? "محفوظ" : "يُحفظ تلقائيًا كمسودة";
  const previewTime = date && time ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(`${date}T${time}:00+03:00`)) : "الآن";
  const disabled = Boolean(saving) || !editable || !pages.length;

  return <AppShell title={initial ? "تحرير المنشور" : "منشور جديد"} parent={{ label: "المنشورات", href: "/posts" }}>
    <div className="page-header"><div><h1>{initial ? "تحرير المنشور" : "منشور جديد"}</h1><p><span className="autosave-status" aria-live="polite"><Icon name="check" width={12} style={{ verticalAlign: "-1px" }} /> {saveStatus}</span></p></div>
      <div className="page-actions"><span className={`badge ${publishingEnabled ? "badge-success" : "badge-warning"}`}>{publishingEnabled ? "النشر الحقيقي مفعّل" : "وضع الاختبار"}</span><HelpTip text={HELP.safeMode} /></div></div>
    {!editable && <div className="alert alert-warning" role="alert">لا يمكن تعديل منشور بدأ نشره أو انتهى. يمكنك تكراره لإنشاء نسخة جديدة.</div>}
    {error && <div className="alert alert-danger" role="alert">{error}</div>}

    <div className="composer">
      <div className="composer-main">
        <fieldset disabled={disabled} className="stack" style={{ gap: 12 }}>
          <section className="card composer-section"><header><h2>الحساب والصفحة</h2></header>
            {showAccountSelect && <div className="field-row">
              <label>حساب Meta
                <select aria-label="حساب Meta" value={accountId} disabled={Boolean(post)} onChange={(e) => {
                  const next = e.target.value;
                  setAccountId(next);
                  const first = pages.find((p) => p.accountId === next);
                  if (first) setPageId(first.id);
                }}>
                  {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label>الصفحة / القناة
                <select aria-label="الصفحة" value={pageId} onChange={(e) => {
                  setPageId(e.target.value);
                  const selected = pages.find((p) => p.id === e.target.value);
                  if (selected?.accountId) setAccountId(selected.accountId);
                }} disabled={Boolean(post)}>
                  {visiblePages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.platform === "instagram" ? "Instagram" : "Facebook"}</option>)}
                </select>
              </label>
            </div>}
            {!showAccountSelect && <select aria-label="الصفحة" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={Boolean(post)}>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.accountName ? ` · ${p.accountName}` : ""}</option>)}</select>}
            {page?.accountName && <small>حساب Meta: <b>{page.accountName}</b> · {page.platform === "instagram" ? "Instagram" : "Facebook"}</small>}
            {!pages.length && <small className="danger">لا توجد صفحة متصلة. <Link href="/pages">أضف حساب Meta أو اربط صفحة</Link></small>}
          </section>

          <section className="card composer-section"><header><h2>المحتوى</h2>{templates.length > 0 && <select aria-label="إدراج قالب" value="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setBody(body.trim() ? `${body}\n\n${t.content}` : t.content); }} style={{ width: "auto" }}><option value="">إدراج قالب…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</header>
            <textarea ref={textarea} className="content" aria-label="نص المنشور" placeholder="اكتب منشورك هنا…" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="counter"><span>{body.length.toLocaleString("ar-SA")} حرف · {body.trim() ? body.trim().split(/\s+/).length.toLocaleString("ar-SA") : 0} كلمة</span>{hashtagsInText.length > 0 && <span>{hashtagsInText.length} هاشتاق</span>}</div>
            <div className="chips" aria-label="إدراج سريع">{["👇", "✅", "🔥", "📌", "\n\n"].map((x) => <button key={x} type="button" className="chip muted" onClick={() => insertAtCursor(x)}>{x === "\n\n" ? "فقرة جديدة" : x}</button>)}</div>
            {urls.length > 0 && <div className="link-preview"><small><Icon name="link" width={12} /> روابط مكتشفة — يعرض Facebook معاينتها عند النشر:</small>{urls.map((u) => { let host = u; try { host = new URL(u).hostname; } catch {} return <a key={u} href={u} target="_blank" rel="noopener noreferrer">{host}</a>; })}</div>}
            {hashtags.length > 0 && <div><small>هاشتاقات استخدمتها سابقًا (إدراج في النص):</small><div className="chips" style={{ marginTop: 6 }}>{hashtags.slice(0, 10).map((h) => <button type="button" className="chip" key={h.tag} onClick={() => insertAtCursor(` #${h.tag}`)}>#{h.tag} <small>{h.uses}</small></button>)}</div></div>}
            <div className="stack" style={{ gap: 8 }}>
              <small><b>منشورات نصية بهوك قوي</b> — جاهزة للاستخدام بدون صورة:</small>
              <div className="chips">
                {TEXT_HOOK_POSTS.map((preset) => <button type="button" className="chip" key={preset.id} title={preset.hook} onClick={() => { setBody(preset.content); setCategory("تفاعل"); setImageUrl(""); setImageInfo(null); }}>{preset.label}</button>)}
              </div>
            </div>
            {aiEnabled && <AiAssist text={body} onApply={(value, mode) => setBody(mode === "append" ? `${body}\n\n${value}` : value)} />}
          </section>

          <section className="card composer-section"><header><h2>الوسائط</h2>{imageUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImageUrl(""); setImageInfo(null); }}><Icon name="trash" width={14} />إزالة</button>}</header>
            {/^https:\/\//i.test(imageUrl) ? <div className="media-slot">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imageUrl} alt="الصورة المرفقة" /><div className="stack" style={{ gap: 4 }}><b style={{ color: "var(--heading)", fontWeight: 500, overflowWrap: "anywhere" }}>{imageInfo?.name ?? imageUrl.split("/").pop()?.split("?")[0]}</b>{imageInfo?.size && <small>{Math.round(imageInfo.size / 1024)} KB · {imageInfo.type}</small>}<div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicker(true)}>استبدال</button></div></div></div>
              : <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && uploadEnabled) upload(f); }}>
                  <span><Icon name="image" width={22} /></span><strong>{uploading ? "جارٍ الرفع…" : uploadEnabled ? "اسحب صورة هنا أو اختر من جهازك" : "أضف صورة من المكتبة أو برابط مباشر"}</strong><small>JPG، PNG، WebP · حتى 10MB</small>
                  {uploadEnabled && <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />}
                </label>}
            <div className="inline-field"><input aria-label="رابط الصورة" type="url" inputMode="url" dir="ltr" placeholder="https://… رابط صورة مباشر" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImageInfo(null); }} /><button type="button" className="btn btn-secondary" onClick={() => setPicker((v) => !v)}><Icon name="media" width={15} />من المكتبة</button></div>
            {picker && <div className="media-picker">{media.length ? media.map((m) => <button type="button" key={m.id} onClick={() => { setImageUrl(m.url); setImageInfo({ name: m.name }); setPicker(false); }} title={m.name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.url} alt={m.name} loading="lazy" /></button>) : <small>المكتبة فارغة. <Link href="/media">أضف صورًا</Link></small>}</div>}
          </section>

          <section className="card composer-section"><header><h2>الحملة والتصنيف</h2></header>
            <div className="field-row">
              <label>الحملة<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">بدون حملة</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>التصنيف<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">بدون</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
            <label>وسوم داخلية <small>(للتنظيم فقط، لا تُنشر)</small><input placeholder="مثل: عروض أكتوبر" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
            {hashtags.length > 0 && <div className="chips">{hashtags.slice(0, 8).map((h) => <button type="button" className="chip muted" key={h.tag} onClick={() => addTag(h.tag)}>+ {h.tag}</button>)}</div>}
          </section>

          <section className="card composer-section"><header><h2>النشر</h2><small>توقيت الرياض (UTC+3)</small></header>
            <div className="field-row"><label>التاريخ<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><div><span>الوقت (24 ساعة)</span><div role="group" aria-label="وقت النشر بتوقيت الرياض" dir="ltr" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <select aria-label="ساعة النشر" value={time.slice(0, 2)} onChange={(e) => setTime(`${e.target.value}:${time.slice(3, 5)}`)}>{Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select>
              <span aria-hidden="true">:</span>
              <select aria-label="دقيقة النشر" value={time.slice(3, 5)} onChange={(e) => setTime(`${time.slice(0, 2)}:${e.target.value}`)}>{Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0")).map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select>
            </div></div></div>
            <BestTimesHint onPick={setTime} />
            {approvalRequired && <small><Icon name="review" width={12} /> الجدولة تمر بالمراجعة أولًا قبل النشر.</small>}
            {checks && <ul className="checklist" aria-label="فحص ما قبل النشر">{checks.map((c) => <li key={c.key} className={c.ok ? "ok" : c.critical ? "bad" : "warn"}>{c.ok ? "✓" : c.critical ? "✕" : "!"} {c.label}{c.detail && <small> · {c.detail}</small>}</li>)}</ul>}
          </section>
        </fieldset>

        <div className="composer-actions">
          <button className="btn btn-secondary" disabled={disabled || !body.trim()} onClick={() => save("draft")}>{saving === "draft" ? "جارٍ الحفظ…" : "حفظ كمسودة"}</button>
          <button className="btn btn-secondary" disabled={disabled || !body.trim()} onClick={() => save("queue")} data-tooltip="يأخذ أول وقت فارغ في الطابور">إضافة للطابور</button>
          <span className="spacer" />
          <button className="btn btn-ghost" disabled={disabled || !body.trim()} onClick={() => save("now")}><Icon name="send" width={15} />نشر الآن</button>
          <button className="btn btn-primary" disabled={disabled || !body.trim()} onClick={() => save("scheduled")}><Icon name="calendar" width={15} />{saving === "scheduled" ? "جارٍ الفحص…" : approvalRequired ? "إرسال للمراجعة" : "جدولة"}</button>
        </div>
      </div>

      <aside className="composer-aside" aria-label="معاينة">
        <div className="row-between"><h2 style={{ fontSize: 13 }}>المعاينة</h2><small>كما سيظهر تقريبًا على Facebook</small></div>
        <article className="fb-preview">
          <div className="fb-head"><span className="fb-avatar">{(page?.name ?? "ص").replace(/^م\.\s*/, "").slice(0, 1)}</span><div><div className="fb-name">{page?.name ?? "الصفحة"}</div><div className="fb-time">{previewTime} · 🌐</div></div></div>
          <div className={`fb-text ${body ? "" : "empty"}`}>{body || "ستظهر معاينة النص هنا"}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/^https:\/\//i.test(imageUrl) && <img className="fb-image" src={imageUrl} alt="" />}
          <div className="fb-actions"><span>👍 أعجبني</span><span>💬 تعليق</span><span>↗ مشاركة</span></div>
        </article>
      </aside>
    </div>
  </AppShell>;
}

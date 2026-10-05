"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { isoToRiyadhInput, riyadhInputToIso } from "@/services/post-time";
import { POST_CATEGORIES } from "@/services/catalog";
import { AppShell } from "../ui/app-shell";
import { ago, api } from "../ui/api";

export type EditorPost = { id: string; pageId: string; content: string; scheduledAt: string | null; updatedAt: string; status: string; category?: string | null; tags?: string[]; campaignId?: string | null; imageUrl?: string | null };
type Option = { id: string; name: string };
const AUTOSAVE_MS = 6000;

export default function PostEditor({ initial, pages, publishingEnabled, campaigns = [], media = [], hashtags = [], approvalRequired = false, prefill }: { initial?: EditorPost; pages: Option[]; publishingEnabled: boolean; campaigns?: Option[]; media?: Array<{ id: string; name: string; url: string }>; hashtags?: Array<{ tag: string; uses: number }>; approvalRequired?: boolean; prefill?: { content?: string; imageUrl?: string; category?: string; tags?: string[] } }) {
  const router = useRouter();
  const [post, setPost] = useState<{ id: string; updatedAt: string; status: string } | null>(initial ? { id: initial.id, updatedAt: initial.updatedAt, status: initial.status } : null);
  const [body, setBody] = useState(initial?.content ?? prefill?.content ?? "");
  const [date, setDate] = useState(isoToRiyadhInput(initial?.scheduledAt || null));
  const [pageId, setPageId] = useState(initial?.pageId || pages[0]?.id || "");
  const [category, setCategory] = useState(initial?.category ?? prefill?.category ?? "");
  const [tags, setTags] = useState((initial?.tags ?? prefill?.tags ?? []).join(" "));
  const [campaignId, setCampaignId] = useState(initial?.campaignId ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? prefill?.imageUrl ?? "");
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [, tick] = useState(0);
  const busy = useRef(false);
  const lastSaved = useRef(body);
  const editable = !post || ["draft", "scheduled", "pending_approval", "approved"].includes(post.status);
  const isDraft = !post || post.status === "draft";

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

  async function save(intent: "draft" | "scheduled" | "queue") {
    if (busy.current) return;
    setError(""); busy.current = true; setSaving(true);
    try {
      const scheduledAt = intent === "scheduled" ? riyadhInputToIso(date) : date ? riyadhInputToIso(date) : undefined;
      if (intent === "scheduled" && new Date(scheduledAt!).getTime() <= Date.now()) throw new Error("حدد موعدًا في المستقبل بتوقيت الرياض");
      const payload = { pageId, content: body, scheduledAt, timezone: "Asia/Riyadh", status: intent === "scheduled" ? "scheduled" : "draft", category: category || null, tags: tags.split(/[\s,،]+/).filter(Boolean), campaignId: campaignId || null, imageUrl: imageUrl.trim() || null, updatedAt: post?.updatedAt };
      const result = await api<{ id: string }>(post ? `/api/posts/${post.id}` : "/api/posts", { method: post ? "PATCH" : "POST", body: payload });
      if (intent === "queue") await api(`/api/posts/${result.id}/queue`, { method: "POST" });
      router.push(`/posts/${result.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الاتصال. تحقق من قائمة المنشورات قبل إعادة المحاولة."); }
    finally { busy.current = false; setSaving(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    save(intent === "scheduled" ? "scheduled" : intent === "queue" ? "queue" : "draft");
  }
  const addTag = (tag: string) => setTags((t) => t.split(/\s+/).includes(tag) ? t : `${t} ${tag}`.trim());
  const urls = Array.from(new Set(body.match(/https?:\/\/[^\s]+/g) ?? []));
  const status = !isDraft ? "التغييرات تُحفظ عند الضغط على حفظ" : savedAt ? `تم الحفظ ${ago(savedAt)}` : post ? "محفوظ" : "سيُحفظ تلقائيًا كمسودة";

  return <AppShell title={initial ? "تحرير المنشور" : "إنشاء منشور"}>
    <div className="detail-top"><h1>{initial ? "تحرير المحتوى" : "إنشاء منشور"}</h1><span className="autosave-status" aria-live="polite">{status}</span><Link href="/posts" className="secondary-button">العودة للمنشورات</Link></div>
    <div className="form-layout composer-layout"><section className="panel-card form-card"><p className="banner">{publishingEnabled ? "النشر الحقيقي مفعّل. المنشور المجدول يُنشر تلقائيًا عند موعده." : "وضع الاختبار مفعّل. لن يُنشر المحتوى فعليًا."}{approvalRequired && " · الجدولة تمر بالموافقة أولًا."}</p>
      {!editable && <p role="alert">لا يمكن تعديل منشور بدأ تنفيذه أو انتهى. راجع سجل المحاولات.</p>}
      {error && <p className="banner" role="alert">{error}</p>}
      <form className="post-form" onSubmit={submit}><fieldset disabled={saving || !editable || !pages.length} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label htmlFor="editor-page">الصفحة<select id="editor-page" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={Boolean(post)}>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
        <label htmlFor="editor-content">نص المنشور<textarea id="editor-content" required rows={9} value={body} onChange={(event) => setBody(event.target.value)} /><small>{body.length.toLocaleString("ar-SA")} حرفًا</small></label>
        <div className="field"><span>الصورة (اختياري)</span><div className="inline-field"><input aria-label="رابط الصورة" type="url" inputMode="url" placeholder="https://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} /><button type="button" className="secondary-button" onClick={() => setPicker((v) => !v)}>من المكتبة</button></div>
          {picker && <div className="media-picker">{media.length ? media.map((m) => <button type="button" key={m.id} onClick={() => { setImageUrl(m.url); setPicker(false); }} title={m.name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.url} alt={m.name} loading="lazy" /></button>) : <small>المكتبة فارغة. <Link href="/media">أضف صورًا</Link></small>}</div>}</div>
        <div className="field-row">
          <label htmlFor="editor-category">التصنيف<select id="editor-category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">بدون</option>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label htmlFor="editor-campaign">الحملة<select id="editor-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">بدون</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <label htmlFor="editor-tags">وسوم داخلية (لا تُنشر)<input id="editor-tags" placeholder="عروض أكتوبر" value={tags} onChange={(e) => setTags(e.target.value)} />{hashtags.length > 0 && <span className="chips">{hashtags.slice(0, 10).map((h) => <button type="button" className="chip" key={h.tag} onClick={() => addTag(h.tag)}>#{h.tag} · {h.uses}</button>)}</span>}</label>
        <label htmlFor="editor-date">موعد النشر · توقيت الرياض (UTC+3)<input id="editor-date" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <div className="form-actions"><button className="secondary-button" type="submit" value="draft">{saving ? "جارٍ الحفظ…" : "حفظ كمسودة"}</button><button className="secondary-button" type="submit" value="queue" title="يأخذ أول وقت متاح في الطابور">إضافة إلى الطابور</button><button className="primary-button" type="submit" value="scheduled">{approvalRequired ? "إرسال للموافقة" : "حفظ وجدولة"}</button></div>
      </fieldset></form>{!pages.length && <p>لا توجد صفحة نشطة متاحة. راجع التكاملات.</p>}
    </section><aside className="panel-card preview-card"><h2>معاينة</h2><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body || "ستظهر معاينة النص هنا"}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/^https:\/\//i.test(imageUrl) && <img className="preview-image" src={imageUrl} alt="معاينة الصورة" />}
      {urls.length > 0 && <div className="link-preview"><small>روابط في النص (يعرض Facebook معاينتها عند النشر):</small>{urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{new URL(u).hostname}</a>)}</div>}
    </aside></div>
  </AppShell>;
}

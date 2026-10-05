"use client";
import Link from "next/link";
import { useState } from "react";
import { api, riyadh } from "../ui/api";

type Parsed = { sheet: string; headers: string[]; rows: Array<Record<string, string>>; truncated: boolean; total: number; mapping: Record<string, string>; fields: Array<{ key: string; label: string; required: boolean }> };
type Summary = { total: number; valid: number; invalid: number; rows: Array<{ index: number; content: string; scheduledAt: string | null; imageUrl: string | null; errors: string[]; warnings: string[] }>; created?: number; scheduled?: number; queued?: number; imageFailures?: number };

export function ImportClient({ pages }: { pages: Array<{ id: string; name: string }> }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [defaultTime, setDefaultTime] = useState("20:00");
  const [mode, setMode] = useState<"draft" | "schedule" | "queue">("draft");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [done, setDone] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const step = done ? 4 : summary ? 3 : parsed ? 2 : 1;

  async function upload(file: File) {
    setBusy(true); setError(""); setSummary(null); setDone(null);
    const form = new FormData(); form.append("file", file);
    try { const p = await api<Parsed>("/api/import/parse", { method: "POST", body: form }); setParsed(p); setMapping(p.mapping); } catch (e) { setError(e instanceof Error ? e.message : "تعذر قراءة الملف"); } finally { setBusy(false); }
  }
  const payload = (dryRun: boolean) => ({ pageId, rows: parsed!.rows, mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)), defaultTime, mode, dryRun });
  async function preview() {
    setBusy(true); setError("");
    try { setSummary(await api<Summary>("/api/import/commit", { method: "POST", body: payload(true) })); } catch (e) { setError(e instanceof Error ? e.message : "تعذرت المعاينة"); } finally { setBusy(false); }
  }
  async function commit() {
    if (!confirm(`إنشاء ${summary!.valid} منشور؟${mode === "schedule" ? " الصفوف الجاهزة ذات الموعد المستقبلي ستُجدول للنشر الحقيقي." : ""}`)) return;
    setBusy(true); setError("");
    try { setDone(await api<Summary>("/api/import/commit", { method: "POST", body: payload(false) })); } catch (e) { setError(e instanceof Error ? e.message : "تعذر الاستيراد"); } finally { setBusy(false); }
  }

  return <>
    <div className="wizard-steps">{["رفع الملف", "ربط الأعمدة", "المراجعة", "تم"].map((label, i) => <span key={label} className={step >= i + 1 ? "active" : ""}><b>{i + 1}</b> {label}</span>)}</div>
    {error && <p className="banner" role="alert">{error}</p>}
    <section className="panel-card"><h2>1. الملف</h2>
      <label className="dropzone"><span>＋</span><strong>{busy && !parsed ? "جارٍ القراءة…" : "اختر ملف Excel أو CSV"}</strong><small>XLSX, XLS, CSV · حتى 10MB · أول 500 صف</small><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
      {parsed && <small>الورقة «{parsed.sheet}» · {parsed.total} صفًا{parsed.truncated ? " (يُستورد أول 500)" : ""} · {parsed.headers.length} عمودًا</small>}
    </section>
    {parsed && <section className="panel-card"><h2>2. ربط الأعمدة</h2><p>اكتشف النظام الأعمدة تلقائيًا؛ غيّر أي ربط حسب ملفك.</p>
      <div className="mapping-grid">{parsed.fields.map((f) => <label key={f.key}>{f.label}{f.required && " *"}<select value={mapping[f.key] ?? ""} onChange={(e) => { setMapping({ ...mapping, [f.key]: e.target.value }); setSummary(null); }}><option value="">— لا يوجد —</option>{parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select>{mapping[f.key] && parsed.rows[0]?.[mapping[f.key]] && <small>مثال: {parsed.rows[0][mapping[f.key]].slice(0, 60)}</small>}</label>)}</div>
      <div className="field-row">
        <label>الصفحة<select value={pageId} onChange={(e) => setPageId(e.target.value)}>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>الوقت الافتراضي (إن لم يوجد عمود وقت)<input type="time" value={defaultTime} onChange={(e) => { setDefaultTime(e.target.value); setSummary(null); }} /></label>
      </div>
      <fieldset className="mode-choice"><legend>بعد الاستيراد</legend>
        <label><input type="radio" checked={mode === "draft"} onChange={() => setMode("draft")} /> حفظ الكل كمسودات (الأكثر أمانًا)</label>
        <label><input type="radio" checked={mode === "schedule"} onChange={() => setMode("schedule")} /> جدولة الصفوف الجاهزة حسب تاريخها</label>
        <label><input type="radio" checked={mode === "queue"} onChange={() => setMode("queue")} /> إضافة الصفوف الجاهزة إلى الطابور</label>
      </fieldset>
      <button className="primary-button" disabled={busy || !mapping.content} onClick={preview}>{busy ? "جارٍ الفحص…" : "معاينة النتيجة"}</button>
    </section>}
    {summary && !done && <section className="panel-card"><h2>3. المراجعة</h2>
      <div className="result-grid"><span><b>{summary.total}</b>صفًا</span><span><b>{summary.valid}</b>صالح</span><span><b>{summary.invalid}</b>به أخطاء (سيُتخطى)</span></div>
      <div className="responsive-table"><table className="data-table"><thead><tr><th>#</th><th>النص</th><th>الموعد</th><th>ملاحظات</th></tr></thead><tbody>{summary.rows.map((r) => <tr key={r.index}><td>{r.index}</td><td>{r.content || "—"}{r.imageUrl && <small className="chip">صورة</small>}</td><td>{riyadh(r.scheduledAt)}</td><td>{r.errors.map((e) => <small key={e} className="cell-error">✕ {e}</small>)}{r.warnings.map((w) => <small key={w} className="hint" style={{ display: "block" }}>! {w}</small>)}</td></tr>)}</tbody></table></div>
      <button className="primary-button" disabled={busy || !summary.valid} onClick={commit}>{busy ? "جارٍ الاستيراد…" : `استيراد ${summary.valid} منشور`}</button>
    </section>}
    {done && <section className="panel-card"><h2>4. تم الاستيراد</h2><p>أُنشئ {done.created} منشور · جُدول {done.scheduled} · في الطابور {done.queued} · تُخطي {done.invalid}{done.imageFailures ? ` · ${done.imageFailures} صورة غير متاحة فحُفظت كمسودات` : ""}.</p><div className="form-actions"><Link className="primary-button" href="/posts">عرض المنشورات</Link><button className="secondary-button" onClick={() => { setParsed(null); setSummary(null); setDone(null); }}>استيراد ملف آخر</button></div></section>}
  </>;
}

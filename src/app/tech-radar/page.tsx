import Link from "next/link";
import { AppShell } from "../ui/app-shell";
import { techRadarSnapshot } from "@/services/tech-radar";
import { editorialTechPost } from "@/services/tech-news-editorial";
import { pageSession } from "@/services/session-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function TechRadar() {
  if (!await pageSession()) redirect("/login");
  const snapshot = await techRadarSnapshot();
  return <AppShell title="رادار أخبار التقنية">
    <div className="page-intro"><div><h2>رادار أخبار التقنية</h2><p>أخبار عربية وإنجليزية خلال آخر 48 ساعة، مرتبة بحسب الحداثة وتعدد مواقع المصادر. ليست قياسًا للمشاهدات أو سرعة الانتشار.</p></div></div>
    <p>آخر جلب: {new Date(snapshot.capturedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} · تُجدّد البيانات عند الزيارة بعد 30 دقيقة. لا يوجد نشر تلقائي من الرادار.</p>
    <details><summary>حالة المصادر</summary><ul>{snapshot.feeds.map((f) => <li key={f.source}>{f.source}: {f.available ? `${f.count} خبرًا مستلمًا` : "تعذر الاتصال — النتائج قد تكون ناقصة"}</li>)}</ul></details>
    {!snapshot.groups.length && <p role="status">لا توجد أخبار مناسبة حاليًا. راجع حالة المصادر أو عد لاحقًا.</p>}
    <div style={{ display: "grid", gap: 16, marginTop: 24 }}>{snapshot.groups.map((group) => <section key={group.articles[0].url} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 20, padding: 24, background: "var(--surface, #fff)" }}>
      <h3 dir="auto">{group.title}</h3>
      <p>درجة أولوية: {group.score}/100 · {group.sourceCount} مواقع مصادر · {group.articles.length} أخبار متشابهة</p>
      <ul>{group.articles.map((a) => <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" dir="auto">{a.source}: {a.title}</a></li>)}</ul>
      <Link className="btn" href={`/posts/new?radarContent=${encodeURIComponent(editorialTechPost(group.articles[0]))}`}>إنشاء مسودة في المحرّر</Link>
      <p><small>راجع المحتوى واختر الصفحة ثم احفظه كمسودة. التجميع تقريبي حسب تشابه العناوين، وليس ترجمة بين اللغات.</small></p>
    </section>)}</div>
  </AppShell>;
}

import Link from "next/link";
import { AppShell } from "../ui/app-shell";
import { techRadarSnapshot } from "@/services/tech-radar";
import { editorialTechPost } from "@/services/tech-news-editorial";
import { pageSession } from "@/services/session-server";
import { redirect } from "next/navigation";
import { filterRadarGroups, normalizeRadarFilters, radarTopics, radarTopic, radarLanguage, type RadarFilters } from "@/services/tech-radar-filters";
import styles from "./radar.module.css";

export const dynamic = "force-dynamic";
export default async function TechRadar({ searchParams }: { searchParams: Promise<RadarFilters> }) {
  if (!await pageSession()) redirect("/login");
  const snapshot = await techRadarSnapshot();
  const filters = normalizeRadarFilters(await searchParams);
  const groups = filterRadarGroups(snapshot.groups, filters);
  const unavailable = snapshot.feeds.filter((f) => !f.available);
  return <AppShell title="رادار أخبار التقنية">
    <div className="page-intro"><div><h2>رادار أخبار التقنية</h2><p>أخبار عربية وإنجليزية خلال آخر 48 ساعة، مرتبة بحسب الحداثة وتعدد مواقع المصادر. ليست قياسًا للمشاهدات أو سرعة الانتشار.</p></div></div>
    <p>آخر جلب: {new Date(snapshot.capturedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} · تُجدّد البيانات عند الزيارة بعد 30 دقيقة. لا يوجد نشر تلقائي من الرادار.</p>
    <div className={styles.stats}><div><strong>{snapshot.groups.length}</strong>مواضيع مرصودة</div><div><strong>{snapshot.groups.filter(g => g.sourceCount > 1).length}</strong>تغطية متعددة</div><div><strong>{snapshot.feeds.length-unavailable.length}/{snapshot.feeds.length}</strong>مصادر متصلة</div><div><strong>{groups.length}</strong>نتائج الفلاتر</div></div>
    {unavailable.length > 0 && <p role="status">النتائج جزئية: تعذر الاتصال بـ {unavailable.map(f => f.source).join("، ")}.</p>}
    <form action="/tech-radar" className={styles.filters}>
      <label>بحث<input type="search" name="q" defaultValue={filters.q} maxLength={120} placeholder="ChatGPT، أتمتة…" /></label>
      <label>الموضوع<select name="topic" defaultValue={filters.topic}><option value="">كل المواضيع</option>{Object.entries(radarTopics).map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <label>اللغة<select name="language" defaultValue={filters.language}><option value="">العربية والإنجليزية</option><option value="ar">عربي</option><option value="en">إنجليزي</option></select></label>
      <label>عمر الخبر<select name="hours" defaultValue={filters.hours}>{[6,12,24,48].map(h => <option key={h} value={h}>آخر {h} ساعة</option>)}</select></label>
      <label>التغطية<select name="sources" defaultValue={filters.sources}><option value="">كل الأخبار</option><option value="multi">مصادر متعددة فقط</option></select></label>
      <label>الترتيب<select name="sort" defaultValue={filters.sort}><option value="priority">الأعلى أولوية</option><option value="latest">الأحدث</option><option value="sources">الأكثر مصادر</option></select></label>
      <button className="btn" type="submit">تطبيق الفلاتر</button><Link href="/tech-radar">مسح الفلاتر</Link>
    </form>
    <details className={styles.explanation}><summary>كيف تُحسب الأولوية؟</summary><p>الحداثة حتى 60 نقطة، وتعدد مواقع المصادر حتى 40 نقطة. الدرجة محسوبة وقت الجلب، وليست توقعًا للتفاعل. تعدد المصادر لا يضمن صحة الخبر؛ قد تنقل المواقع عن مصدر واحد. التجميع تقريبي وليس ترجمة بين اللغات.</p></details>
    <details><summary>حالة المصادر</summary><ul>{snapshot.feeds.map((f) => <li key={f.source}>{f.source}: {f.available ? `${f.count} خبرًا مستلمًا` : "تعذر الاتصال — النتائج قد تكون ناقصة"}</li>)}</ul></details>
    {!groups.length && <p role="status">لا توجد نتائج مطابقة. وسّع الفترة أو امسح الفلاتر، وراجع حالة المصادر.</p>}
    <div className={styles.grid}>{groups.map((group) => <section key={group.articles[0].url} className={styles.card}>
      <div className={styles.badges}><span>{radarTopics[radarTopic(group.title)]}</span><span>{radarLanguage(group.title) === "ar" ? "عربي" : "إنجليزي"}</span><span>{group.sourceCount > 1 ? "تغطية متعددة" : "مصدر واحد"}</span></div>
      <h3 dir="auto">{group.title}</h3>
      <p>درجة أولوية: {group.score}/100 · {group.sourceCount} مواقع مصادر · {group.articles.length} أخبار متشابهة</p>
      <p className={styles.meta}>أحدث خبر: {new Date(group.articles[0].publishedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} · نقاط تعدد المصادر: {Math.min(40,(group.sourceCount-1)*20)}/40</p>
      <details><summary>المصادر واختيار الخبر</summary><ul>{group.articles.map((a) => <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" dir="auto">{a.source}: {a.title}</a><p><Link href={`/posts/new?radarContent=${encodeURIComponent(editorialTechPost(a))}`}>استخدام هذا الخبر في المحرّر</Link></p></li>)}</ul></details>
      <details className={styles.preview}><summary>معاينة نص المنشور</summary><p dir="auto">{editorialTechPost(group.articles[0])}</p></details>
      <Link className="btn" href={`/posts/new?radarContent=${encodeURIComponent(editorialTechPost(group.articles[0]))}`}>إنشاء مسودة في المحرّر</Link>
      <p><small>راجع المحتوى واختر الصفحة ثم احفظه كمسودة. فتح المحرّر وحده لا يحفظ منشورًا.</small></p>
    </section>)}</div>
  </AppShell>;
}

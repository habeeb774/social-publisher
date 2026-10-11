import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "../ui/app-shell";
import { politicsRadarSnapshot } from "@/services/politics-radar";
import { editorialPoliticsPost, politicsRisk } from "@/services/politics-editorial";
import { pageSession } from "@/services/session-server";
import { filterRadarGroups, normalizeRadarFilters, radarLanguage, type RadarFilters } from "@/services/tech-radar-filters";
import styles from "../tech-radar/radar.module.css";

export const dynamic = "force-dynamic";
export default async function PoliticsRadar({ searchParams }: { searchParams: Promise<RadarFilters & { risk?: string }> }) {
  if (!await pageSession()) redirect("/login");
  const snapshot = await politicsRadarSnapshot();
  const params = await searchParams;
  const filters = normalizeRadarFilters({ ...params, topic: "" });
  const risk = params.risk === "normal" ? "normal" : "";
  const groups = filterRadarGroups(snapshot.groups, filters).filter((g) => !risk || politicsRisk(g.title) === risk);
  const unavailable = snapshot.feeds.filter((f) => !f.available);
  return <AppShell title="رادار الأخبار السياسية">
    <div className="page-intro"><div><h2>رادار الأخبار السياسية</h2><p>أخبار سياسية من مؤسسات إخبارية معروفة خلال آخر 48 ساعة، مرتبة بحسب الحداثة وتعدد المصادر. لا يوجد نشر تلقائي: كل خبر يمر بمراجعتك قبل النشر.</p></div></div>
    <details className={styles.explanation} open><summary>قواعد حماية الصفحة من التقييد</summary><ul>
      <li>تُستبعد تلقائيًا العناوين التي تشير لمشاهد عنيفة أو جثث، أو مبايعة جماعات محظورة، أو ألفاظ طائفية، أو شائعات وأخبار غير مؤكدة.</li>
      <li>الأخبار الحساسة (قتلى، قصف، هجمات) تظهر بتنبيه، ونصّها محايد ومنسوب للمصدر.</li>
      <li>انشر نصًا ورابطًا فقط، ولا تعِد رفع صور أو مقاطع القنوات الإخبارية (حقوق نشر).</li>
      <li>لا تضف رأيًا أو سخرية من أشخاص أو دول، ولا عبارات مثل «شارك إن كنت توافق» — فيسبوك يعاقب استدرار التفاعل.</li>
      <li>خفّف الوتيرة: بضعة أخبار يوميًا أفضل من سيل منشورات متتالية.</li>
      <li>الإعلانات الممولة لمحتوى سياسي تتطلب توثيق «الإعلانات السياسية» في Meta؛ لا تروّج هذه المنشورات قبله.</li>
    </ul></details>
    <p>آخر جلب: {new Date(snapshot.capturedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} · تُجدّد البيانات بعد 30 دقيقة.</p>
    <div className={styles.stats}><div><strong>{snapshot.groups.length}</strong>مواضيع مرصودة</div><div><strong>{snapshot.groups.filter((g) => politicsRisk(g.title) === "sensitive").length}</strong>أخبار حساسة</div><div><strong>{snapshot.feeds.length - unavailable.length}/{snapshot.feeds.length}</strong>مصادر متصلة</div><div><strong>{groups.length}</strong>نتائج الفلاتر</div></div>
    {unavailable.length > 0 && <p role="status">النتائج جزئية: تعذر الاتصال بـ {unavailable.map((f) => f.source).join("، ")}.</p>}
    <form action="/politics-radar" className={styles.filters}>
      <label>بحث<input type="search" name="q" defaultValue={filters.q} maxLength={120} placeholder="قمة، مفاوضات…" /></label>
      <label>الحساسية<select name="risk" defaultValue={risk}><option value="">الكل</option><option value="normal">غير الحساسة فقط</option></select></label>
      <label>اللغة<select name="language" defaultValue={filters.language}><option value="">العربية والإنجليزية</option><option value="ar">عربي</option><option value="en">إنجليزي</option></select></label>
      <label>عمر الخبر<select name="hours" defaultValue={filters.hours}>{[6, 12, 24, 48].map((h) => <option key={h} value={h}>آخر {h} ساعة</option>)}</select></label>
      <label>التغطية<select name="sources" defaultValue={filters.sources}><option value="">كل الأخبار</option><option value="multi">مصادر متعددة فقط</option></select></label>
      <label>الترتيب<select name="sort" defaultValue={filters.sort}><option value="priority">الأعلى أولوية</option><option value="latest">الأحدث</option><option value="sources">الأكثر مصادر</option></select></label>
      <button className="btn" type="submit">تطبيق الفلاتر</button><Link href="/politics-radar">مسح الفلاتر</Link>
    </form>
    <details><summary>حالة المصادر</summary><ul>{snapshot.feeds.map((f) => <li key={f.source}>{f.source}: {f.available ? `${f.count} خبرًا مستلمًا` : "تعذر الاتصال — النتائج قد تكون ناقصة"}</li>)}</ul></details>
    {!groups.length && <p role="status">لا توجد نتائج مطابقة. وسّع الفترة أو امسح الفلاتر.</p>}
    <div className={styles.grid}>{groups.map((group) => {
      const sensitive = politicsRisk(group.title) === "sensitive";
      return <section key={group.articles[0].url} className={styles.card}>
        <div className={styles.badges}><span>{sensitive ? "⚠️ حساس" : "سياسة"}</span><span>{radarLanguage(group.title) === "ar" ? "عربي" : "إنجليزي"}</span><span>{group.sourceCount > 1 ? "تغطية متعددة" : "مصدر واحد"}</span></div>
        <h3 dir="auto">{group.title}</h3>
        <p>درجة أولوية: {group.score}/100 · {group.sourceCount} مواقع مصادر · {group.articles.length} أخبار متشابهة</p>
        {sensitive && <p role="note"><small>خبر حساس: تأكد من الصياغة المحايدة ولا ترفق صورًا أو مقاطع عنيفة.</small></p>}
        {group.sourceCount < 2 && <p role="note"><small>مصدر واحد فقط حتى الآن — يُفضّل انتظار تأكيد مصدر آخر.</small></p>}
        <details><summary>المصادر واختيار الخبر</summary><ul>{group.articles.map((a) => <li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer" dir="auto">{a.source}: {a.title}</a><p><Link href={`/posts/new?radarContent=${encodeURIComponent(editorialPoliticsPost(a))}`}>استخدام هذا الخبر في المحرّر</Link></p></li>)}</ul></details>
        <details className={styles.preview}><summary>معاينة نص المنشور</summary><p dir="auto" style={{ whiteSpace: "pre-line" }}>{editorialPoliticsPost(group.articles[0])}</p></details>
        <Link className="btn" href={`/posts/new?radarContent=${encodeURIComponent(editorialPoliticsPost(group.articles[0]))}`}>إنشاء مسودة في المحرّر</Link>
        <p><small>اختر صفحة «رَصْدُوق» في المحرّر ثم احفظ كمسودة.</small></p>
      </section>;
    })}</div>
  </AppShell>;
}

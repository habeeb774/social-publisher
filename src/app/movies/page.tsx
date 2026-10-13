import { redirect } from "next/navigation";
import { pageSession } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
export const dynamic = "force-dynamic";
export default async function MoviesPage() {
  if (!(await pageSession())) redirect("/login");
  return <AppShell title="ناشر الأفلام"><main className="stack">
    <h1>ناشر الأفلام والريلز</h1>
    <p>30 ثانية لكل ريل · 5 ريلز يوميًا · ترجمة تلقائية · ترقيم الأجزاء</p>
    <section className="card" style={{padding:24}}>
      <h2>مرحلة الإعداد</h2>
      <p>الرفع والمعالجة والنشر غير مفعّلة حتى تجهيز التخزين الخاص والعامل المنفصل.</p>
      <p>مراجعة المقاطع والتحقق من حقوق الفيلم واختيار صفحة Facebook إلزامية قبل النشر.</p>
    </section>
  </main></AppShell>;
}

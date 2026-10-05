import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { getGeneralSettings } from "@/services/general-settings";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { pageCan } from "@/services/session-server";
import { Icon } from "../ui/icons";
import { GeneralForm } from "./general-form";
import { SETTINGS_SECTIONS, SettingsShell } from "./settings-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات" };

export default async function Settings() {
  const [general, pages, canEdit] = await Promise.all([getGeneralSettings(), getDb().select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages).where(eq(facebookPages.isActive, true)), pageCan("settings.manage")]);
  const live = isPublishingEnabled();
  return <SettingsShell active="/settings" title="الإعدادات" description="إعدادات مساحة العمل العامة.">
    <GeneralForm initial={general} pages={pages} canEdit={canEdit} />
    <section className="card"><div className="card-header"><h2>وضع النشر</h2><span className={`badge ${live ? "badge-success" : "badge-warning"}`}>{live ? "النشر الحقيقي مفعّل" : "وضع الاختبار"}</span></div><small>{live ? "المنشورات المجدولة تُنشر فعليًا على صفحاتك." : "لا يُنشر أي محتوى فعليًا."} يُغيَّر من متغير البيئة PUBLISHING_ENABLED في Vercel فقط، ولا يمكن تغييره من الواجهة.</small></section>
    <div className="card-grid">{SETTINGS_SECTIONS.slice(1).map((s) => <Link key={s.href} href={s.href} className="card" style={{ textDecoration: "none" }}><span className="row"><Icon name={s.icon} width={16} style={{ color: "var(--primary)" }} /><b style={{ color: "var(--heading)", fontWeight: 600 }}>{s.label}</b></span><small>{s.description}</small></Link>)}</div>
  </SettingsShell>;
}

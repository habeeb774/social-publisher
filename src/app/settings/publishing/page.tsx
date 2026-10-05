import Link from "next/link";
import { getPublishingRules } from "@/services/rules-store";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { SettingsShell } from "../settings-shell";
import { RulesClient } from "./rules-client";

export const dynamic = "force-dynamic";
export default async function PublishingRules() {
  return <SettingsShell active="/settings/publishing" title="النشر" description="وضع النشر، الطابور، فترات الإيقاف والأيام الهادئة (توقيت الرياض).">
    <section className="card"><div className="list">
      <div className="setting-row"><div><strong>وضع النشر</strong><small>يُغيَّر من متغير البيئة PUBLISHING_ENABLED فقط.</small></div><span className={`badge ${isPublishingEnabled() ? "badge-success" : "badge-warning"}`}>{isPublishingEnabled() ? "النشر الحقيقي مفعّل" : "وضع الاختبار"}</span></div>
      <div className="setting-row"><div><strong>إعادة المحاولة</strong><small>الأخطاء المؤقتة (انقطاع، حد الطلبات) فقط، ومن مركز الفشل. أخطاء الصلاحيات والبيانات لا تُعاد تلقائيًا، والنتائج غير المؤكدة تحتاج تأكيدك منعًا للتكرار.</small></div><Link className="btn btn-secondary btn-sm" href="/failed">مركز الفشل</Link></div>
      <div className="setting-row"><div><strong>أوقات الطابور</strong><small>الأوقات الأسبوعية التي يأخذها كل منشور يُضاف للطابور.</small></div><Link className="btn btn-secondary btn-sm" href="/queue">إدارة الطابور</Link></div>
    </div></section>
    <RulesClient initial={await getPublishingRules()} />
  </SettingsShell>;
}

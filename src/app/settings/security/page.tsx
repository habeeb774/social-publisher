import Link from "next/link";
import { SESSION_TTL_SECONDS } from "@/services/request-auth";
import { SettingsShell } from "../settings-shell";

export const metadata = { title: "الأمان" };
const Ok = () => <span className="badge badge-success">مفعّل</span>;

export default function Security() {
  return <SettingsShell active="/settings/security" title="الأمان" description="ملخص الحماية المطبقة في النظام.">
    <section className="card"><div className="list">
      <div className="setting-row"><div><strong>الجلسات</strong><small>ملف تعريف موقّع (HMAC-SHA256) يحمل المستخدم والدور، مدته {SESSION_TTL_SECONDS / 3600} ساعات، HttpOnly وSameSite=Lax.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>الصلاحيات على الخادم</strong><small>كل واجهة API تتحقق من الدور قبل التنفيذ. تعديل الدور في الملف يبطله التوقيع.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>كلمات المرور</strong><small>مشفرة بخوارزمية scrypt مع ملح عشوائي، ومقارنة بزمن ثابت.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>حماية الطلبات</strong><small>عمليات الكتابة تُقبل من نفس الموقع فقط (Origin check)، والمدخلات تُتحقق بـ Zod.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>عامل النشر</strong><small>محمي بـ CRON_SECRET، مع Claim ذري يمنع النشر المزدوج.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>الأسرار</strong><small>التوكنات وكلمات المرور في متغيرات البيئة فقط، ولا تظهر في الواجهة أو التصدير.</small></div><Ok /></div>
      <div className="setting-row"><div><strong>سجل العمليات</strong><small>كل إنشاء وتعديل وجدولة وموافقة ودخول يُسجَّل مع اسم المستخدم.</small></div><Link href="/logs">عرض السجل</Link></div>
    </div></section>
  </SettingsShell>;
}

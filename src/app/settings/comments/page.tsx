import Link from "next/link";
import { flags, withinBusinessHours } from "@/services/comments/rules";
import { approvalRequired } from "@/services/post-ops";
import { SettingsShell } from "../settings-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "إعدادات التعليقات" };
const Flag = ({ on }: { on: boolean }) => <span className={`badge ${on ? "badge-success" : "badge-neutral"}`}>{on ? "مفعّل" : "متوقف"}</span>;

/** Comment safe modes are independent env flags; none of them is tied to PUBLISHING_ENABLED. */
export default async function CommentSettings() {
  const f = flags();
  const review = await approvalRequired();
  return <SettingsShell active="/settings/comments" title="التعليقات" description="كل خاصية لها وضع أمان مستقل ولا ترتبط بوضع النشر.">
    <section className="card"><div className="list">
      <div className="setting-row"><div><strong>الرد على Facebook</strong><small>FACEBOOK_COMMENT_REPLIES_ENABLED · حتى عند تفعيله لا يُرسل أي رد ما لم يدعم الموصل الرد فعليًا.</small></div><Flag on={f.replies} /></div>
      <div className="setting-row"><div><strong>الردود التلقائية</strong><small>AUTO_COMMENT_REPLIES_ENABLED · القاعدة التي لا تتطلب موافقة بشرية تُرسل تلقائيًا عند حلول وقتها، أما القاعدة التي تتطلب موافقة فتبقى بانتظار الاعتماد.</small></div><Flag on={f.autoReplies} /></div>
      <div className="setting-row"><div><strong>محرك الأتمتة</strong><small>COMMENT_AUTOMATION_ENABLED · تقييم القواعد على التعليقات الجديدة وجدولة الردود التلقائية المستحقة.</small></div><Flag on={f.automation} /></div>
      <div className="setting-row"><div><strong>ساعات العمل</strong><small>8:00 ص – 11:00 م بتوقيت الرياض. خارجها تتحول الإجراءات التلقائية إلى «متابعة».</small></div><span className={`badge ${withinBusinessHours(new Date()) ? "badge-success" : "badge-neutral"}`}>{withinBusinessHours(new Date()) ? "ضمن ساعات العمل الآن" : "خارج ساعات العمل الآن"}</span></div>
      <div className="setting-row"><div><strong>المراجعة البشرية</strong><small>الشكاوى ومشاكل الدفع والتهديدات تُحوَّل دائمًا لمراجعة بشرية، ولا يُرد عليها تلقائيًا أبدًا.</small></div><span className="badge badge-success">دائمًا</span></div>
      <div className="setting-row"><div><strong>حماية من التكرار</strong><small>تجاهل تعليقات الصفحة نفسها، والتعليقات التي رُد عليها، والمزعجة والمخفية. رد تلقائي واحد كحد أقصى لكل تعليق.</small></div><span className="badge badge-success">مفعّلة</span></div>
      <div className="setting-row"><div><strong>موافقة المنشورات</strong><small>سير الموافقة للمنشورات (مستقل عن التعليقات).</small></div><Link href="/settings/notifications">{review ? "مفعّلة" : "متوقفة"} · تعديل</Link></div>
    </div></section>
    <div className="row"><Link className="btn btn-secondary" href="/templates/replies">الردود الجاهزة</Link><Link className="btn btn-secondary" href="/automations/comments">قواعد الأتمتة</Link></div>
  </SettingsShell>;
}

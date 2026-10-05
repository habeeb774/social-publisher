import Link from "next/link";
import { CommentsOnboarding } from "../inbox/comments-onboarding";
import { setupProgress } from "@/services/setup";
import { AppShell } from "../ui/app-shell";
import { DismissOnboarding } from "./dismiss";

export const dynamic = "force-dynamic";
/** Setup wizard: each step reflects the real system state and links to where it is done. */
export default async function Onboarding() {
  const { steps, percent, complete } = await setupProgress();
  const current = steps.find((s) => !s.done && !s.optional);
  return <AppShell title="معالج الإعداد">
    <div className="page-intro"><div><h2>مرحبًا بك في Social Publisher</h2><p>{complete ? "الإعداد مكتمل؛ النظام جاهز للاستخدام." : "أكمل الخطوات التالية بالترتيب. كل خطوة تُحدّث تلقائيًا عند إنجازها."}</p></div><DismissOnboarding /></div>
    <div className="progress" aria-label={`الإعداد ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
    <ol className="wizard-list">{steps.map((s, i) => <li key={s.key} className={`panel-card ${s.done ? "done" : s.key === current?.key ? "current" : ""}`}>
      <div className="row-between"><strong><span className="step-num">{s.done ? "✓" : i + 1}</span> {s.label}{s.optional && <small> (اختياري)</small>}</strong>{!s.done && <Link className={s.key === current?.key ? "primary-button" : "secondary-button"} href={s.href}>ابدأ</Link>}</div>
      <p>{s.help}</p>
    </li>)}</ol>
    <CommentsOnboarding/>
    {complete && <Link className="primary-button" href="/dashboard">الذهاب للوحة التحكم</Link>}
  </AppShell>;
}

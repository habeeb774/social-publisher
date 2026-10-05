import Link from "next/link";
import type { SetupStep } from "@/services/setup";

/** Dashboard card; hidden once all required steps are done or the user dismissed it. */
export function SetupProgress({ steps, percent }: { steps: SetupStep[]; percent: number }) {
  return <section className="panel-card setup-card" aria-label="تقدم الإعداد">
    <div className="row-between"><h2>إعداد النظام {percent}%</h2><Link href="/onboarding">معالج الإعداد</Link></div>
    <div className="progress"><span style={{ width: `${percent}%` }} /></div>
    <ul className="checklist">{steps.map((s) => <li key={s.key} className={s.done ? "ok" : s.optional ? "warn" : "bad"}>{s.done ? "✓" : "○"} {s.done ? s.label : <Link href={s.href}>{s.label}</Link>}{s.optional && !s.done && <small> (اختياري)</small>}</li>)}</ul>
  </section>;
}

import Link from "next/link";
import type { SetupStep } from "@/services/setup";

/** Dashboard card; hidden once all required steps are done or the user dismissed it. */
export function SetupProgress({ steps, percent }: { steps: SetupStep[]; percent: number }) {
  return <section className="card setup-card" aria-label="تقدم الإعداد">
    <div className="row-between"><h2>إعداد النظام <span className="num muted">{percent}%</span></h2><Link href="/onboarding">معالج الإعداد</Link></div>
    <div className="progress"><span style={{ width: `${percent}%` }} /></div>
    <ul className="setup-steps">{steps.map((s) => <li key={s.key} className={s.done ? "done" : ""}>{s.done ? <span>✓ {s.label}</span> : <Link href={s.href}>○ {s.label}{s.optional && <small> (اختياري)</small>}</Link>}</li>)}</ul>
  </section>;
}

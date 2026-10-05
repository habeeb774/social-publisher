import Link from "next/link";
import { currentMonth, goalsWithProgress } from "@/services/goals";
import { AppShell } from "../ui/app-shell";
import { GoalsClient } from "./goals-client";

export const dynamic = "force-dynamic";
export default async function Goals({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const p = (await searchParams).month;
  const month = p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : currentMonth();
  const [y, m] = month.split("-").map(Number);
  const shift = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const goals = await goalsWithProgress(month);
  return <AppShell title="الأهداف الشهرية">
    <div className="page-intro"><div><h2>الأهداف الشهرية</h2><p>التقدم يُحسب من المنشورات المنشورة فعليًا خلال الشهر (بتوقيت الرياض).</p></div><div className="intro-actions"><Link className="icon-button" href={`/goals?month=${shift(-1)}`} aria-label="الشهر السابق">‹</Link><strong>{month}</strong><Link className="icon-button" href={`/goals?month=${shift(1)}`} aria-label="الشهر التالي">›</Link></div></div>
    <GoalsClient month={month} goals={goals.map((g) => ({ id: g.id, category: g.category, target: g.target, published: g.published, scheduled: g.scheduled, percent: g.percent }))} />
  </AppShell>;
}

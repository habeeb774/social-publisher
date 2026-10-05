import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { campaigns, posts } from "@/db/schema";
import { systemAnalytics } from "@/services/analytics";
import { AppShell } from "../../ui/app-shell";
import { STATUS_LABELS, riyadh } from "../../ui/api";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";
export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const [[campaign], list, stats] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1),
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt }).from(posts).where(and(eq(posts.campaignId, id), isNull(posts.deletedAt))).orderBy(asc(posts.scheduledAt)).limit(200),
    systemAnalytics(id),
  ]);
  if (!campaign) notFound();
  const t = stats.totals;
  // Group the campaign calendar by Riyadh date.
  const byDate = new Map<string, typeof list>();
  for (const p of list.filter((x) => x.scheduledAt)) { const d = new Date(p.scheduledAt!.getTime() + 3 * 3600000).toISOString().slice(0, 10); byDate.set(d, [...(byDate.get(d) ?? []), p]); }
  return <AppShell title={campaign.name}>
    <div className="page-intro"><div><h2>{campaign.name}</h2><p>{campaign.description}</p></div><Link className="btn btn-secondary" href="/campaigns">كل الحملات</Link></div>
    <section className="metrics-row"><div className="metric"><small>المنشورات</small><strong>{t.total}</strong></div><div className="metric"><small>المجدولة</small><strong>{t.scheduled}</strong></div><div className="metric"><small>المنشورة</small><strong>{t.published}</strong></div><div className="metric"><small>الفاشلة</small><strong>{t.failed}</strong></div><div className="metric"><small>نسبة النجاح</small><strong>{stats.successRate === null ? "—" : `${stats.successRate}%`}</strong></div></section>
    <div className="form-layout">
      <section className="card"><h2>تقويم الحملة</h2>{!byDate.size ? <p>لا توجد منشورات بمواعيد. اربط منشورات من صفحة المنشورات (إجراء «ربط بحملة») أو من المحرر.</p> : [...byDate.entries()].map(([d, items]) => <div key={d} className="campaign-day"><b>{d}</b><ul className="timeline-list">{items.map((p) => <li key={p.id}><Link href={`/posts/${p.id}`}>{riyadh(p.scheduledAt, "time")} · {p.content.slice(0, 80)}</Link><small>{STATUS_LABELS[p.status]}</small></li>)}</ul></div>)}
        {list.some((p) => !p.scheduledAt) && <><h3>بدون موعد</h3><ul className="timeline-list">{list.filter((p) => !p.scheduledAt).map((p) => <li key={p.id}><Link href={`/posts/${p.id}`}>{p.content.slice(0, 80)}</Link><small>{STATUS_LABELS[p.status]}</small></li>)}</ul></>}
      </section>
      <CampaignForm initial={{ id: campaign.id, name: campaign.name, description: campaign.description ?? "", startDate: campaign.startDate ?? "", endDate: campaign.endDate ?? "", status: campaign.status }} />
    </div>
    {stats.byDay.length > 0 && <section className="card"><h2>أيام النشر</h2><ul className="bar-list">{stats.byDay.map((d) => <li key={d.label}><span>{d.label}</span><span className="bar"><i style={{ width: `${(d.count / stats.byDay[0].count) * 100}%` }} /></span><b>{d.count}</b></li>)}</ul></section>}
  </AppShell>;
}

import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, posts } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { CampaignForm } from "./campaign-form";
import { campaignStatusLabel } from "@/services/catalog";

export const dynamic = "force-dynamic";
export default async function Campaigns() {
  const rows = await getDb().select({ c: campaigns, total: sql<number>`count(${posts.id})::int`, published: sql<number>`count(${posts.id}) filter (where ${posts.status}='published')::int` }).from(campaigns).leftJoin(posts, sql`${posts.campaignId} = ${campaigns.id} and ${posts.deletedAt} is null`).groupBy(campaigns.id).orderBy(desc(campaigns.createdAt)).limit(100);
  return <AppShell title="الحملات">
    <div className="page-intro"><div><h2>الحملات</h2><p>اجمع منشورات مناسبة واحدة (اليوم الوطني، رمضان، Black Friday) وتابع تقدمها.</p></div></div>
    <div className="form-layout"><CampaignForm />
      <section>{!rows.length ? <div className="panel-card empty-state"><strong>لا توجد حملات بعد</strong></div> : <div className="card-grid">{rows.map(({ c, total, published }) => <Link key={c.id} href={`/campaigns/${c.id}`} className="panel-card campaign-card"><header><strong>{c.name}</strong><span className="chip">{campaignStatusLabel(c.status)}</span></header><small>{c.startDate ?? "—"} ← {c.endDate ?? "—"}</small><p>{total} منشور · {published} منشور فعليًا</p><div className="progress" aria-label="نسبة النشر"><span style={{ width: `${total ? Math.round((published / total) * 100) : 0}%` }} /></div></Link>)}</div>}</section>
    </div>
  </AppShell>;
}

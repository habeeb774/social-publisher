import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { postTemplates } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";
export default async function Templates() {
  const rows = await getDb().select().from(postTemplates).orderBy(desc(postTemplates.updatedAt)).limit(200);
  return <AppShell title="القوالب">
    <div className="page-intro"><div><h2>قوالب المنشورات</h2><p>نصوص جاهزة لعروض المنتجات والأخبار والتهاني وغيرها، تبدأ منها منشورًا جديدًا بضغطة.</p></div></div>
    <TemplatesClient initial={rows.map((r) => ({ ...r, defaultSettings: r.defaultSettings as { category?: string; tags?: string[] }, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }))} />
  </AppShell>;
}

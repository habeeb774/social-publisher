import { and, desc, ilike, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { storageProvider } from "@/services/storage";
import { AppShell } from "../ui/app-shell";
import { MediaClient } from "./media-client";

export const dynamic = "force-dynamic";
export default async function Media({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const rows = await getDb().select().from(mediaAssets).where(and(isNull(mediaAssets.deletedAt), q ? ilike(mediaAssets.name, `%${q.replace(/[%_]/g, "")}%`) : undefined)).orderBy(desc(mediaAssets.createdAt)).limit(120);
  return <AppShell title="مكتبة الوسائط">
    <div className="page-intro"><div><h2>مكتبة الوسائط</h2><p>كل الصور المضافة أو المرفوعة، جاهزة لإعادة الاستخدام.</p></div></div>
    <MediaClient initialQuery={q} uploadEnabled={storageProvider.configured()} initial={rows.map((r) => ({ id: r.id, name: r.name, url: r.url, mimeType: r.mimeType, size: r.size, source: r.source, createdAt: r.createdAt.toISOString() }))} />
  </AppShell>;
}

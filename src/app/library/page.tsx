import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { libraryItems } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { LibraryClient } from "./library-client";

export const dynamic = "force-dynamic";
export default async function Library() {
  const rows = await getDb().select().from(libraryItems).orderBy(desc(libraryItems.updatedAt)).limit(200);
  return <AppShell title="مكتبة المحتوى">
    <div className="page-intro"><div><h2>مكتبة المحتوى</h2><p>نصوص وصور وأفكار ومنشورات جاهزة تحفظها الآن وتستخدمها لاحقًا.</p></div></div>
    <LibraryClient initial={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} />
  </AppShell>;
}

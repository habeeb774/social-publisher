import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { libraryItems } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { LibraryClient } from "../library/library-client";

export const dynamic = "force-dynamic";
export default async function Ideas() {
  const rows = await getDb().select().from(libraryItems).where(eq(libraryItems.kind, "idea")).orderBy(desc(libraryItems.updatedAt)).limit(200);
  return <AppShell title="أفكار المحتوى">
    <div className="page-intro"><div><h2>أفكار المحتوى</h2><p>سجّل الأفكار، رتّبها حسب الحالة (جديدة، مخطط لها، مستبعدة)، وحوّلها لمسودة بضغطة.</p></div></div>
    <LibraryClient ideasOnly initial={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} />
  </AppShell>;
}

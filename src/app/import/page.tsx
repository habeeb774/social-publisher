import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";
export default async function Import() {
  const pages = await getDb().select({ id: facebookPages.id, name: facebookPages.name }).from(facebookPages).where(eq(facebookPages.isActive, true));
  return <AppShell title="استيراد المحتوى">
    <div className="page-intro"><div><h2>استيراد جماعي</h2><p>ارفع ملف Excel أو CSV، اربط الأعمدة، راجع النتيجة، ثم أنشئ المنشورات. لا يُنشر شيء قبل تأكيدك.</p></div></div>
    <ImportClient pages={pages} />
  </AppShell>;
}

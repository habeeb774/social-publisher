import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { TRASH_DAYS } from "@/services/trash";
import { AppShell } from "../../ui/app-shell";
import { TrashClient } from "./trash-client";

export const dynamic = "force-dynamic";
const daysLeft = (deletedAt: Date) => Math.ceil(TRASH_DAYS - (Date.now() - deletedAt.getTime()) / 86400000);
/** Deleted drafts only. Published records are never trashed; they are archived instead. */
export default async function Trash() {
  const rows = await getDb().select({ id: posts.id, content: posts.content, deletedAt: posts.deletedAt }).from(posts).where(and(isNotNull(posts.deletedAt), eq(posts.status, "draft"))).orderBy(desc(posts.deletedAt)).limit(100);
  return <AppShell title="سلة المحذوفات">
    <div className="page-intro"><div><h2>سلة المحذوفات</h2><p>المسودات المحذوفة تبقى {TRASH_DAYS} يومًا ويمكن استرجاعها، ثم تُحذف نهائيًا.</p></div><Link className="btn btn-secondary" href="/posts">العودة للمنشورات</Link></div>
    <TrashClient rows={rows.map((r) => ({ id: r.id, content: r.content, deletedAt: r.deletedAt!.toISOString(), daysLeft: daysLeft(r.deletedAt!) }))} />
  </AppShell>;
}

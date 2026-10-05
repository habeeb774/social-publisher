import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, publicationAttempts } from "@/db/schema";
import { classifyError } from "@/services/error-classes";
import { AppShell } from "../ui/app-shell";
import { FailedClient } from "./failed-client";

export const dynamic = "force-dynamic";
export default async function Failed() {
  const rows = await getDb().select({ id: posts.id, content: posts.content, lastError: posts.lastError, failedAt: posts.failedAt, attempts: sql<number>`count(${publicationAttempts.id})::int`, lastAttempt: sql<Date | null>`max(${publicationAttempts.startedAt})` })
    .from(posts).leftJoin(publicationAttempts, eq(publicationAttempts.postId, posts.id)).where(and(eq(posts.status, "failed"), isNull(posts.deletedAt))).groupBy(posts.id).orderBy(desc(posts.failedAt)).limit(100);
  return <AppShell title="مركز الفشل">
    <div className="page-intro"><div><h2>المنشورات الفاشلة</h2><p>سبب كل فشل مصنفًا بلغة واضحة، مع إعادة المحاولة للأخطاء المؤقتة فقط.</p></div></div>
    <FailedClient rows={rows.map((r) => ({ ...r, failedAt: r.failedAt?.toISOString() ?? null, lastAttempt: r.lastAttempt ? new Date(r.lastAttempt).toISOString() : null, kind: classifyError(r.lastError) }))} />
  </AppShell>;
}

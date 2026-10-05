import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, queueSlots } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { QueueClient } from "./queue-client";
import { HelpTip, HELP } from "../ui/help-tip";

export const dynamic = "force-dynamic";
export default async function Queue() {
  const db = getDb();
  const [slots, queued, drafts] = await Promise.all([
    db.select({ weekday: queueSlots.weekday, time: queueSlots.time }).from(queueSlots).orderBy(asc(queueSlots.weekday), asc(queueSlots.time)),
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt }).from(posts).where(and(eq(posts.inQueue, true), inArray(posts.status, ["scheduled", "pending_approval"]), isNull(posts.deletedAt))).orderBy(asc(posts.queueOrder)).limit(200),
    db.select({ id: posts.id, content: posts.content, status: posts.status, scheduledAt: posts.scheduledAt }).from(posts).where(and(inArray(posts.status, ["draft", "approved"]), isNull(posts.deletedAt))).orderBy(desc(posts.updatedAt)).limit(20),
  ]);
  const iso = (rows: typeof queued) => rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt?.toISOString() ?? null }));
  return <AppShell title="طابور المحتوى">
    <div className="page-intro"><div><h2>طابور المحتوى <HelpTip text={HELP.queue} /></h2><p>حدّد أوقاتك الثابتة مرة واحدة، ثم أضف المنشورات وسيُوزعها النظام تلقائيًا. اسحب لإعادة الترتيب.</p></div></div>
    <QueueClient initialSlots={slots} queued={iso(queued)} drafts={iso(drafts)} />
  </AppShell>;
}

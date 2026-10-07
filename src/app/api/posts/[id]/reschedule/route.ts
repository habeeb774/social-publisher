import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { snapshotPost } from "@/services/post-ops";
import { nearbyScheduled } from "@/services/prepublish";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

/** Moves a scheduled post to a new future time (calendar drag & drop). Published posts are never touched. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const workspace=await workspacePostMutationAccess(request,["posts.edit","posts.publish"]);
  if(workspace.response)return workspace.response;
  const { id } = await params;
  const parsed = z.object({ scheduledAt: z.coerce.date() }).safeParse(await request.json().catch(() => null));
  if (!isUuid(id) || !parsed.success) return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  const at = parsed.data.scheduledAt;
  if (at.getTime() <= Date.now() + 60000) return NextResponse.json({ error: "لا يمكن النقل إلى موعد في الماضي" }, { status: 422 });
  const db = getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt),workspace.predicate)).limit(1);
  if (!post || !["scheduled", "pending_approval", "approved", "draft"].includes(post.status)) return NextResponse.json({ error: "لا يمكن نقل منشور منشور أو قيد النشر" }, { status: 409 });
  const [row] = await db.update(posts).set({ scheduledAt: at, inQueue: false, queueOrder: null, updatedAt:sql`greatest(clock_timestamp(),${posts.updatedAt}+interval '1 millisecond')` }).where(and(eq(posts.id, id), eq(posts.status, post.status),isNull(posts.deletedAt),workspace.predicate,sql`date_trunc('milliseconds',${posts.updatedAt})=${post.updatedAt.toISOString()}::timestamptz`)).returning();
  if (!row) return NextResponse.json({ error: "تغيرت حالة المنشور" }, { status: 409 });
  await snapshotPost(post, "reschedule");
  await logAudit("post.rescheduled", "post", id, { from: post.scheduledAt, to: at });
  return NextResponse.json({ ...row, nearby: await nearbyScheduled(at, id,workspace.context) });
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { postMedia, posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { prePublishChecks } from "@/services/prepublish";
import { isPublishingEnabled } from "@/services/publishing-mode";
import { denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";

/**
 * Queues a draft/approved/scheduled post for the very next worker run (≤1 minute).
 * The worker still does the atomic claim and safe-mode check, so this never bypasses publishing safety.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request, true, "content.publish"); if (denied) return denied;
  const workspace=await workspacePostMutationAccess(request,["posts.publish"]);
  if(workspace.response)return workspace.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  const db = getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, id), isNull(posts.deletedAt),workspace.predicate)).limit(1);
  if (!post || !["draft", "approved", "scheduled"].includes(post.status)) return NextResponse.json({ error: "حالة المنشور لا تسمح بالنشر الآن" }, { status: 409 });
  const [image] = await db.select({ url: postMedia.url }).from(postMedia).where(eq(postMedia.postId, id)).limit(1);
  // Time is "now", so only the non-time critical checks apply.
  const check = await prePublishChecks({ pageId: post.pageId, content: post.content, scheduledAt: new Date(Date.now() + 120000), imageUrl: image?.url, postId: id,workspace:workspace.context });
  const blocking = check.items.filter((i) => i.critical && !i.ok && i.key !== "time");
  if (blocking.length) return NextResponse.json({ error: blocking.map((i) => `${i.label}: ${i.detail ?? "فشل"}`).join(" · "), checks: check.items }, { status: 422 });
  const [row] = await db.update(posts).set({ status: "scheduled", scheduledAt: new Date(), inQueue: false, queueOrder: null, updatedAt:sql`greatest(clock_timestamp(),${posts.updatedAt}+interval '1 millisecond')` }).where(and(eq(posts.id, id), inArray(posts.status, ["draft", "approved", "scheduled"]),isNull(posts.deletedAt),workspace.predicate,sql`date_trunc('milliseconds',${posts.updatedAt})=${post.updatedAt.toISOString()}::timestamptz`)).returning();
  if (!row) return NextResponse.json({ error: "تغيرت حالة المنشور" }, { status: 409 });
  await logAudit("post.publish_now", "post", id);
  return NextResponse.json({ ...row, publishingEnabled: isPublishingEnabled() });
}

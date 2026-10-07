import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { postInputSchema } from "@/services/posts";
import { syncImage, toPostFields } from "@/services/post-save";
import { snapshotPost } from "@/services/post-ops";
import { logAudit } from "@/services/audit";
import { sendAlert } from "@/services/alerts";
import { prePublishChecks } from "@/services/prepublish";
import { denyPageOutsideScope, denyPostOutsideScope } from "@/services/access-scope";
import { currentUser } from "@/services/rbac";
import { authorizeWorkspace } from "@/services/workspace-request";
import { workspaceMembershipQuery, workspaceCan } from "@/services/workspace-access";
import { workspacePostEditPredicate } from "@/services/workspace-posts";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  {const denied=await guard(request);if(denied)return denied;}
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const workspaceId=request.nextUrl.searchParams.get("workspace");
  let workspacePredicate;
  let workspaceContext;
  if(workspaceId!==null || process.env.WORKSPACE_ISOLATION_ENABLED==="true") {
    const access=await authorizeWorkspace(request,workspaceId??"",{
      user:currentUser,
      membership:async(userId,workspace)=>(await getDb().execute(workspaceMembershipQuery(userId,workspace))).rows,
    },"posts.edit");
    if(access.response)return access.response;
    workspaceContext=access.context;
    workspacePredicate=workspacePostEditPredicate(access.context);
  }
  const {id}=await params;
  if(!z.uuid().safeParse(id).success)return NextResponse.json({error:"المنشور غير موجود"},{status:404});
  const body=await request.json().catch(()=>null);
  const parsed=postInputSchema.safeParse(body);
  const version=z.iso.datetime().safeParse(body?.updatedAt);
  if(!parsed.success||!version.success)return NextResponse.json({error:parsed.error?.issues[0]?.message||"أعد تحميل المنشور قبل الحفظ"},{status:400});
  const data=parsed.data;
  if(workspaceContext && data.status==="scheduled") {
    if(!workspaceCan(workspaceContext.role,"posts.publish"))return NextResponse.json({error:"ليست لديك صلاحية جدولة النشر."},{status:403});
    workspacePredicate=workspacePostEditPredicate(workspaceContext,true);
  }
  // Campaign ownership is not migrated yet. Do not attach a global campaign to tenant content.
  if(workspacePredicate && data.campaignId)return NextResponse.json({error:"ربط الحملات بمساحات العمل غير متاح بعد."},{status:422});
  const db=getDb();
  const [before]=await db.select().from(posts).where(and(eq(posts.id,id),isNull(posts.deletedAt),workspacePredicate)).limit(1);
  if(!before)return NextResponse.json({error:"المنشور غير موجود"},{status:404});
  {const scoped=await denyPostOutsideScope(request,id);if(scoped)return scoped;}
  {const scoped=await denyPageOutsideScope(request,data.pageId);if(scoped)return scoped;}
    // Server-side gate: critical checklist failures block scheduling regardless of the UI.
    if(data.status==="scheduled"){const check=await prePublishChecks({pageId:data.pageId,content:data.content,scheduledAt:data.scheduledAt,imageUrl:data.imageUrl,postId:id});if(check.blocking)return NextResponse.json({error:check.items.filter(i=>i.critical&&!i.ok).map(i=>`${i.label}: ${i.detail??"فشل"}`).join(" · "),checks:check.items},{status:422});}
  // A concurrent worker claim or editor save invalidates this compare-and-update.
  const [updated]=await db.update(posts).set({...await toPostFields(data),inQueue:false,queueOrder:null,updatedAt:sql`greatest(clock_timestamp(), ${posts.updatedAt} + interval '1 millisecond')`,lastError:null}).where(and(eq(posts.id,id),eq(posts.pageId,data.pageId),isNull(posts.deletedAt),workspacePredicate,inArray(posts.status,["draft","scheduled","pending_approval","approved"]),sql`date_trunc('milliseconds', ${posts.updatedAt}) = ${version.data}::timestamptz`)).returning();
  if(!updated)return NextResponse.json({error:"تغير المنشور أو بدأ تنفيذه. أعد تحميل الصفحة قبل التعديل."},{status:409});
  await snapshotPost(before,"edit");
  await syncImage(id,data.imageUrl);
  await logAudit("post.updated","post",id,{from:before.status,to:updated.status,contentChanged:before.content!==updated.content,timeChanged:before.scheduledAt?.getTime()!==updated.scheduledAt?.getTime()});
  if(updated.status==="scheduled"&&before.status!=="scheduled")await sendAlert("scheduled",`تمت جدولة منشور (${id.slice(0,8)})`,updated.content.slice(0,120),0);
  return NextResponse.json(updated);
}

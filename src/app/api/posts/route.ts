import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { postInputSchema } from "@/services/posts";
import { guard } from "@/services/api-guard";
import { syncImage, toPostFields } from "@/services/post-save";
import { logAudit } from "@/services/audit";
import { sendAlert } from "@/services/alerts";
import { prePublishChecks } from "@/services/prepublish";
import { allowedPageIds, denyPageOutsideScope } from "@/services/access-scope";
import { currentUser } from "@/services/rbac";
import { workspaceMembershipQuery, workspaceCan } from "@/services/workspace-access";
import { createWorkspacePostListHandler, workspacePostListQuery, workspacePostCreateQuery } from "@/services/workspace-posts";
import { authorizeWorkspace } from "@/services/workspace-request";

const workspacePostList = createWorkspacePostListHandler({
  user:currentUser,
  membership:async(userId,workspaceId)=>(await getDb().execute(workspaceMembershipQuery(userId,workspaceId))).rows,
  read:async(context,page)=>(await getDb().execute(workspacePostListQuery(context,page))).rows,
});

export async function GET(request:NextRequest) {
  const workspaceId=request.nextUrl.searchParams.get("workspace");
  // Cutover remains disabled until all other tenant-owned endpoints and UI are migrated.
  // Once enabled, omitting a workspace cannot fall back to global data.
  if(workspaceId!==null || process.env.WORKSPACE_ISOLATION_ENABLED==="true")return workspacePostList(request,workspaceId??"");
  {const denied=await guard(request);if(denied)return denied;}
  try{const rows=await getDb().select().from(posts).where(isNull(posts.deletedAt)).orderBy(desc(posts.createdAt)).limit(Math.min(Number(request.nextUrl.searchParams.get("limit"))||50,200)).offset(Math.max(Number(request.nextUrl.searchParams.get("offset"))||0,0));const user=await currentUser(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const allowed=await allowedPageIds(user);return NextResponse.json(allowed===null?rows:rows.filter(row=>allowed.has(row.pageId)));}
  catch{return NextResponse.json({error:"تعذر تحميل المنشورات"},{status:500});}
}
export async function POST(request:NextRequest) {
  {const denied=await guard(request);if(denied)return denied;}
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const workspaceId=request.nextUrl.searchParams.get("workspace");
  let workspaceContext;
  if(workspaceId!==null || process.env.WORKSPACE_ISOLATION_ENABLED==="true") {
    const access=await authorizeWorkspace(request,workspaceId??"",{
      user:currentUser,
      membership:async(userId,workspace)=>(await getDb().execute(workspaceMembershipQuery(userId,workspace))).rows,
    },"posts.create");
    if(access.response)return access.response;
    workspaceContext=access.context;
  }
  const parsed=postInputSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"بيانات غير صالحة"},{status:400});
  const data=parsed.data;
  if(workspaceContext && data.campaignId)return NextResponse.json({error:"ربط الحملات بمساحات العمل غير متاح بعد."},{status:422});
  if(workspaceContext && data.status==="scheduled" && !workspaceCan(workspaceContext.role,"posts.publish"))return NextResponse.json({error:"ليست لديك صلاحية جدولة النشر."},{status:403});
  if(data.pageId!=="habeb"&&!z.uuid().safeParse(data.pageId).success)return NextResponse.json({error:"الصفحة غير صالحة"},{status:400});
  try {
    const db=getDb();
    const [page]=await db.select({id:facebookPages.id}).from(facebookPages).where(and(eq(facebookPages.isActive,true),data.pageId==="habeb"?eq(facebookPages.facebookPageId,"1330947143441946"):eq(facebookPages.id,data.pageId))).limit(1);
    if(!page)return NextResponse.json({error:"الصفحة غير متاحة. تحقق من اتصال Facebook Organic."},{status:409});
    {const scoped=await denyPageOutsideScope(request,page.id);if(scoped)return scoped;}
    // Server-side gate: critical checklist failures block scheduling regardless of the UI.
    if(data.status==="scheduled"){const check=await prePublishChecks({pageId:page.id,content:data.content,scheduledAt:data.scheduledAt,imageUrl:data.imageUrl,postId:undefined});if(check.blocking)return NextResponse.json({error:check.items.filter(i=>i.critical&&!i.ok).map(i=>`${i.label}: ${i.detail??"فشل"}`).join(" · "),checks:check.items},{status:422});}
    const fields=await toPostFields(data);
    let post;
    if(workspaceContext) {
      const result=await db.execute(workspacePostCreateQuery(workspaceContext,page.id,{...fields,campaignId:null},data.status==="scheduled"));
      const inserted=result.rows[0];
      if(!inserted)return NextResponse.json({error:"الصفحة أو صلاحية إنشاء المنشور لم تعد متاحة."},{status:403});
      const id=z.uuid().parse(inserted.id);
      [post]=await db.select().from(posts).where(eq(posts.id,id)).limit(1);
    } else [post]=await db.insert(posts).values({pageId:page.id,...fields}).returning();
    if(!post)throw new Error("POST_CREATE_RESULT_UNAVAILABLE");
    await syncImage(post.id,data.imageUrl);
    await logAudit("post.created","post",post.id,{status:post.status});
    if(post.status==="scheduled")await sendAlert("scheduled",`تمت جدولة منشور (${post.id.slice(0,8)})`,post.content.slice(0,120),0);
    return NextResponse.json(post,{status:201});
  }catch{return NextResponse.json({error:"تعذر حفظ المنشور. تحقق من القائمة قبل إعادة المحاولة."},{status:500});}
}

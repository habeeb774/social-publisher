import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { isAdminRequest } from "@/services/request-auth";
import { postInputSchema } from "@/services/posts";
import { syncImage, toPostFields } from "@/services/post-save";
import { snapshotPost } from "@/services/post-ops";
import { logAudit } from "@/services/audit";
import { sendAlert } from "@/services/alerts";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const {id}=await params;
  if(!z.uuid().safeParse(id).success)return NextResponse.json({error:"المنشور غير موجود"},{status:404});
  const body=await request.json().catch(()=>null);
  const parsed=postInputSchema.safeParse(body);
  const version=z.iso.datetime().safeParse(body?.updatedAt);
  if(!parsed.success||!version.success)return NextResponse.json({error:parsed.error?.issues[0]?.message||"أعد تحميل المنشور قبل الحفظ"},{status:400});
  const data=parsed.data;
  const db=getDb();
  const [before]=await db.select().from(posts).where(and(eq(posts.id,id),isNull(posts.deletedAt))).limit(1);
  if(!before)return NextResponse.json({error:"المنشور غير موجود"},{status:404});
  // A concurrent worker claim or editor save invalidates this compare-and-update.
  const [updated]=await db.update(posts).set({...await toPostFields(data),inQueue:false,queueOrder:null,updatedAt:sql`greatest(clock_timestamp(), ${posts.updatedAt} + interval '1 millisecond')`,lastError:null}).where(and(eq(posts.id,id),eq(posts.pageId,data.pageId),isNull(posts.deletedAt),inArray(posts.status,["draft","scheduled","pending_approval","approved"]),sql`date_trunc('milliseconds', ${posts.updatedAt}) = ${version.data}::timestamptz`)).returning();
  if(!updated)return NextResponse.json({error:"تغير المنشور أو بدأ تنفيذه. أعد تحميل الصفحة قبل التعديل."},{status:409});
  await snapshotPost(before,"edit");
  await syncImage(id,data.imageUrl);
  await logAudit("post.updated","post",id,{from:before.status,to:updated.status,contentChanged:before.content!==updated.content,timeChanged:before.scheduledAt?.getTime()!==updated.scheduledAt?.getTime()});
  if(updated.status==="scheduled"&&before.status!=="scheduled")await sendAlert("scheduled",`تمت جدولة منشور (${id.slice(0,8)})`,updated.content.slice(0,120),0);
  return NextResponse.json(updated);
}

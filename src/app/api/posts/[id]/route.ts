import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { isAdminRequest } from "@/services/request-auth";
import { postInputSchema } from "@/services/posts";

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
  // A concurrent worker claim or editor save invalidates this compare-and-update.
  const [updated]=await getDb().update(posts).set({content:data.content,status:data.status,scheduledAt:data.status==="scheduled"?data.scheduledAt:null,timezone:data.timezone,updatedAt:sql`greatest(clock_timestamp(), ${posts.updatedAt} + interval '1 millisecond')`,lastError:null}).where(and(eq(posts.id,id),eq(posts.pageId,data.pageId),isNull(posts.deletedAt),inArray(posts.status,["draft","scheduled"]),sql`date_trunc('milliseconds', ${posts.updatedAt}) = ${version.data}::timestamptz`)).returning();
  if(!updated)return NextResponse.json({error:"تغير المنشور أو بدأ تنفيذه. أعد تحميل الصفحة قبل التعديل."},{status:409});
  return NextResponse.json(updated);
}

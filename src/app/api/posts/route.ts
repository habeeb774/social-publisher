import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { postInputSchema } from "@/services/posts";
import { isAdminRequest } from "@/services/request-auth";

export async function GET(request:NextRequest) {
  if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await getDb().select().from(posts).where(isNull(posts.deletedAt)).orderBy(desc(posts.createdAt)).limit(200));}
  catch{return NextResponse.json({error:"تعذر تحميل المنشورات"},{status:500});}
}
export async function POST(request:NextRequest) {
  if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const parsed=postInputSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"بيانات غير صالحة"},{status:400});
  const data=parsed.data;
  if(data.pageId!=="habeb"&&!z.uuid().safeParse(data.pageId).success)return NextResponse.json({error:"الصفحة غير صالحة"},{status:400});
  try {
    const db=getDb();
    const [page]=await db.select({id:facebookPages.id}).from(facebookPages).where(and(eq(facebookPages.isActive,true),data.pageId==="habeb"?eq(facebookPages.facebookPageId,"1330947143441946"):eq(facebookPages.id,data.pageId))).limit(1);
    if(!page)return NextResponse.json({error:"الصفحة غير متاحة. تحقق من اتصال Facebook Organic."},{status:409});
    const [post]=await db.insert(posts).values({pageId:page.id,content:data.content,scheduledAt:data.status==="scheduled"?data.scheduledAt:null,timezone:data.timezone,status:data.status}).returning();
    return NextResponse.json(post,{status:201});
  }catch{return NextResponse.json({error:"تعذر حفظ المنشور. تحقق من القائمة قبل إعادة المحاولة."},{status:500});}
}

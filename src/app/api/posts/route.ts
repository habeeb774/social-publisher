import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { postInputSchema } from "@/services/posts";
import { isAdminRequest } from "@/services/request-auth";
export async function GET(request: NextRequest){if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await getDb().select().from(posts));}catch{return NextResponse.json({error:"تعذر تحميل المنشورات"},{status:500});}}
export async function POST(request: NextRequest){if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});try{const data=postInputSchema.parse(await request.json());const db=getDb();let pageId=data.pageId;if(data.pageId==="habeb"){let page=(await db.select({id:facebookPages.id}).from(facebookPages).where(eq(facebookPages.isActive,true)).limit(1))[0];if(!page){page=(await db.insert(facebookPages).values({name:"م. حبيب اليوسفي Habeb Al-Yousfi",facebookPageId:"1330947143441946",mcpConnectionReference:"windsor:facebook_organic",status:"active",isActive:true}).returning({id:facebookPages.id}))[0]}pageId=page.id}const row=await db.insert(posts).values({pageId,content:data.content,scheduledAt:data.scheduledAt,timezone:data.timezone,status:data.status}).returning();return NextResponse.json(row[0],{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"بيانات غير صالحة"},{status:400});}}

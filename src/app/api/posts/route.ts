import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { postInputSchema } from "@/services/posts";
export async function GET(){try{return NextResponse.json(await getDb().select().from(posts));}catch{return NextResponse.json({error:"تعذر تحميل المنشورات"},{status:500});}}
export async function POST(request: Request){try{const data=postInputSchema.parse(await request.json());const row=await getDb().insert(posts).values({pageId:data.pageId,content:data.content,scheduledAt:data.scheduledAt,timezone:data.timezone,status:data.status}).returning();return NextResponse.json(row[0],{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"بيانات غير صالحة"},{status:400});}}

import { isPublishingEnabled } from "@/services/publishing-mode";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
export async function GET(){try{await getDb().execute(sql`select 1`);return NextResponse.json({status:"ok",database:"ok",publishingEnabled:isPublishingEnabled()});}catch{return NextResponse.json({status:"degraded",database:"unavailable"},{status:503});}}

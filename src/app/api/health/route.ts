import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
export async function GET(){try{await getDb().execute(sql`select 1`);return NextResponse.json({status:"ok",database:"ok",publishingEnabled:process.env.PUBLISHING_ENABLED==="true"});}catch{return NextResponse.json({status:"degraded",database:"unavailable"},{status:503});}}

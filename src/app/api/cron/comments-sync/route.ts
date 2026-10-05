import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
/** Separate worker, intentionally not scheduled: Windsor polling limits remain unverified. */
export async function POST(request:Request){
  const expected=process.env.CRON_SECRET??"";const actual=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({status:"blocked",code:"COMMENTS_POLLING_RATE_LIMIT_UNVERIFIED",realRepliesEnabled:false},{status:409});
}

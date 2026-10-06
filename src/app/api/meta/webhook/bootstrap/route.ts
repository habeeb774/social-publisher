import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { setupMetaWebhook } from "@/services/meta-webhook";

export const dynamic = "force-dynamic";

function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}

export async function POST(request:NextRequest){
  const expected=process.env.META_WEBHOOK_BOOTSTRAP_TOKEN?.trim();
  const provided=(request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
  if(!expected||!provided||!equal(expected,provided))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await setupMetaWebhook(),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"META_WEBHOOK_SETUP_FAILED"},{status:502});}
}

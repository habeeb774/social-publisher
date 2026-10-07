import { NextRequest,NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
const bodySchema=z.object({conversationId:z.uuid()});
export async function POST(request:NextRequest){
  const denied=await guard(request); if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:"بيانات غير صحيحة"},{status:400});
  const db=getDb(); const id=parsed.data.conversationId;
  const r=await db.execute(sql`insert into leads(page_id,messenger_conversation_id,name,contact,source,last_contact_at)
    select page_id,id,coalesce(participant_name,'متابع'),participant_id,'messenger',last_customer_message_at
    from messenger_conversations where id=${id}
    on conflict (messenger_conversation_id) where messenger_conversation_id is not null
    do update set updated_at=now(),last_contact_at=excluded.last_contact_at
    returning id,status`);
  if(!r.rows.length)return NextResponse.json({error:"المحادثة غير موجودة"},{status:404});
  return NextResponse.json(r.rows[0]);
}

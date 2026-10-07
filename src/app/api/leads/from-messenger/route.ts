import { NextRequest,NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
import { can, currentUser } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { logAudit } from "@/services/audit";
const bodySchema=z.object({conversationId:z.uuid()});
export async function POST(request:NextRequest){
  const denied=await guard(request,true,"leads.create"); if(denied)return denied;
  if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:"بيانات غير صحيحة"},{status:400});
  try {
  const user=await currentUser(request);
  if(!user)return NextResponse.json({error:"يرجى تسجيل الدخول"},{status:401});
  if(!can(user.role,"leads.create"))return NextResponse.json({error:"ليست لديك صلاحية لإنشاء عميل محتمل"},{status:403});
  const allowed=await allowedPageIds(user);
  const db=getDb(); const id=parsed.data.conversationId;
  const r=await db.execute(sql`insert into leads(page_id,messenger_conversation_id,name,contact,source,last_contact_at)
    select page_id,id,coalesce(participant_name,'متابع'),participant_id,'messenger',last_customer_message_at
    from messenger_conversations where id=${id} and ${leadPageScope(allowed)}
    on conflict (messenger_conversation_id) where messenger_conversation_id is not null
    do update set updated_at=now(),last_contact_at=excluded.last_contact_at
    returning id,status`);
  if(!r.rows.length)return NextResponse.json({error:"المحادثة غير موجودة أو غير متاحة لك"},{status:404});
  await logAudit("lead.converted_from_messenger","lead",String(r.rows[0].id),{conversationId:id});
  return NextResponse.json(r.rows[0]);
  } catch {
    console.error("Lead conversion failed",{code:"LEAD_CONVERSION_FAILED"});
    return NextResponse.json({error:"تعذر إنشاء العميل المحتمل. حاول مرة أخرى لاحقًا.",code:"LEAD_CONVERSION_FAILED"},{status:503});
  }
}

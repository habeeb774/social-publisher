import { NextRequest,NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { guard,isUuid } from "@/services/api-guard";
import { currentUser,can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { leadPageScope } from "@/services/leads-access";
import { leadAssignmentSchema } from "@/services/leads-model";
import { listLeadAssignees } from "@/services/leads-assignment";
import { logAudit } from "@/services/audit";
type Context={params:Promise<{id:string}>};
const filters=z.object({q:z.string().trim().max(100),cursor:z.uuid().nullable()});
export async function GET(request:NextRequest,{params}:Context){
  const denied=await guard(request,false,"leads.assign");if(denied)return denied;
  const {id}=await params;const parsed=filters.safeParse({q:request.nextUrl.searchParams.get("q")??"",cursor:request.nextUrl.searchParams.get("cursor")});
  if(!isUuid(id)||!parsed.success)return NextResponse.json({error:"بيانات البحث غير صالحة"},{status:400});
  try{
    const user=await currentUser(request);if(!user||!can(user.role,"leads.assign"))return NextResponse.json({error:"ليست لديك صلاحية للإسناد"},{status:403});
    const scope=leadPageScope(await allowedPageIds(user),"l.page_id");
    const result=await getDb().execute(sql`select l.page_id,case when p.is_active=true then p.facebook_page_id else null end as facebook_page_id from leads l left join facebook_pages p on p.id=l.page_id where l.id=${id} and ${scope} limit 1`);
    const lead=result.rows[0];if(!lead)return NextResponse.json({error:"العميل غير موجود أو غير متاح"},{status:404});
    return NextResponse.json(await listLeadAssignees(lead.page_id?String(lead.page_id):null,lead.facebook_page_id?String(lead.facebook_page_id):null,parsed.data.q,parsed.data.cursor),{headers:{"Cache-Control":"private, no-store"}});
  }catch{console.error("Lead assignees unavailable",{code:"LEAD_ASSIGNEES_FAILED"});return NextResponse.json({error:"تعذر تحميل أعضاء الفريق"},{status:503});}
}
export async function PATCH(request:NextRequest,{params}:Context){
  const denied=await guard(request,true,"leads.assign");if(denied)return denied;
  const {id}=await params;const parsed=leadAssignmentSchema.safeParse(await request.json().catch(()=>null));
  if(!isUuid(id)||!parsed.success)return NextResponse.json({error:"بيانات الإسناد غير صالحة"},{status:400});
  try{
    const user=await currentUser(request);if(!user||!can(user.role,"leads.assign"))return NextResponse.json({error:"ليست لديك صلاحية للإسناد"},{status:403});
    const scope=leadPageScope(await allowedPageIds(user));
    const db=getDb(),lead=await db.execute(sql`select page_id from leads where id=${id} and ${scope} limit 1`);
    if(!lead.rows.length)return NextResponse.json({error:"العميل غير موجود أو غير متاح"},{status:404});
    const target=parsed.data.assignedTo;
    if(target){
      const result=await db.execute(sql`select id,role from users where id=${target} and is_active=true and role in ('admin','editor') limit 1`);
      const member=result.rows[0];if(!member)return NextResponse.json({error:"اختر عضوًا نشطًا لديه صلاحية متابعة العميل"},{status:400});
      const allowed=await allowedPageIds({id:target,role:member.role as "admin"|"editor"});
      if(allowed!==null&&(!lead.rows[0].page_id||!allowed.has(String(lead.rows[0].page_id))))return NextResponse.json({error:"هذا العضو لا يملك صلاحية صفحة العميل"},{status:400});
    }
    const result=await db.execute(sql`update leads set assigned_to=${target}::uuid,updated_at=now() where id=${id} and ${scope}
      and updated_at=${parsed.data.expectedUpdatedAt}::timestamptz
      and ${target?sql`exists(select 1 from users where id=${target} and is_active=true and role in ('admin','editor'))`:sql`true`}
      returning id,updated_at::text as updated_at`);
    if(!result.rows.length)return NextResponse.json({error:"تغيرت بيانات العميل أو العضو؛ حدّث الصفحة قبل الإسناد"},{status:409});
    await logAudit("lead.assigned","lead",id,{assignedTo:target});
    return NextResponse.json(result.rows[0]);
  }catch{console.error("Lead assignment unavailable",{code:"LEAD_ASSIGNMENT_FAILED"});return NextResponse.json({error:"تعذر حفظ الإسناد"},{status:503});}
}

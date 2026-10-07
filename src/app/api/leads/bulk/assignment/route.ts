import { NextRequest,NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { guard } from '@/services/api-guard';
import { can,currentUser } from '@/services/rbac';
import { allowedPageIds } from '@/services/access-scope';
import { leadPageScope } from '@/services/leads-access';
import { listLeadAssigneesForPages } from '@/services/leads-assignment';
import { leadBulkAssignmentSchema,leadBulkAssignmentQuery } from '@/services/leads-bulk';
import { loadLeadAssignmentAuthorization } from '@/services/leads-assignment-authorization';

const lookupSchema=z.object({
  leads:z.array(z.uuid().transform(id=>id.toLowerCase())).min(1).max(50),
  q:z.string().trim().max(100),cursor:z.uuid().nullable(),
}).refine(input=>new Set(input.leads).size===input.leads.length);
export async function GET(request:NextRequest){
  const denied=await guard(request,false,'leads.assign');if(denied)return denied;
  const params=request.nextUrl.searchParams;
  const parsed=lookupSchema.safeParse({leads:params.getAll('lead'),q:params.get('q')??'',cursor:params.get('cursor')});
  if(!parsed.success)return NextResponse.json({error:'اختر من 1 إلى 50 عميلًا دون تكرار.'},{status:400});
  try{
    const user=await currentUser(request);
    if(!user)return NextResponse.json({error:'يرجى تسجيل الدخول'},{status:401});
    if(!can(user.role,'leads.assign'))return NextResponse.json({error:'ليست لديك صلاحية للإسناد.'},{status:403});
    const allowed=await allowedPageIds(user);
    const ids=sql.join(parsed.data.leads.map(id=>sql`${id}::uuid`),sql`, `);
    const result=await getDb().execute(sql`select l.page_id,case when p.is_active=true then p.facebook_page_id else null end as remote_id
      from leads l left join facebook_pages p on p.id=l.page_id where l.id in (${ids}) and ${leadPageScope(allowed,'l.page_id')}`);
    if(result.rows.length!==parsed.data.leads.length)return NextResponse.json({error:'أحد العملاء غير موجود أو غير متاح لك.'},{status:404});
    const pages=result.rows.map(row=>({pageId:row.page_id===null?null:String(row.page_id),remotePageId:row.remote_id===null?null:String(row.remote_id)}));
    return NextResponse.json(await listLeadAssigneesForPages(pages,parsed.data.q,parsed.data.cursor),{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    console.error('Bulk lead candidates unavailable',{code:'LEAD_BULK_ASSIGNEES_UNAVAILABLE'});
    return NextResponse.json({error:'تعذر تحميل أعضاء الفريق. حاول مجددًا.'},{status:503});
  }
}
export async function PATCH(request:NextRequest){
  const denied=await guard(request,true,'leads.assign');if(denied)return denied;
  const parsed=leadBulkAssignmentSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'بيانات الإسناد غير صالحة. اختر من 1 إلى 50 عميلًا دون تكرار.'},{status:400});
  try{
    const user=await currentUser(request);
    if(!user)return NextResponse.json({error:'يرجى تسجيل الدخول'},{status:401});
    if(!can(user.role,'leads.assign'))return NextResponse.json({error:'ليست لديك صلاحية للإسناد.'},{status:403});
    const allowed=await allowedPageIds(user);
    const target=parsed.data.assignedTo?await loadLeadAssignmentAuthorization(parsed.data.assignedTo):null;
    if(parsed.data.assignedTo&&!target)return NextResponse.json({error:'اختر عضوًا نشطًا لديه صلاحية متابعة العملاء.'},{status:400});
    const result=(await getDb().execute(leadBulkAssignmentQuery(parsed.data,allowed,user.email,target))).rows[0];
    if(Number(result.accessible)!==parsed.data.leads.length)return NextResponse.json({error:'أحد العملاء غير موجود أو غير متاح لك. لم تُعدّل الدفعة.'},{status:404});
    if(Number(result.changed)!==parsed.data.leads.length)return NextResponse.json({error:'تغيرت بيانات العملاء أو صلاحيات العضو. أعد تحميل القائمة؛ لم تُعدّل الدفعة.'},{status:409});
    return NextResponse.json({updated:Number(result.changed)},{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    console.error('Bulk lead assignment unavailable',{code:'LEAD_BULK_ASSIGNMENT_UNAVAILABLE'});
    return NextResponse.json({error:'تعذر تأكيد الإسناد. أعد تحميل القائمة قبل المحاولة.'},{status:503});
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { guard } from '@/services/api-guard';
import { can, currentUser } from '@/services/rbac';
import { allowedPageIds } from '@/services/access-scope';
import { leadBulkStageSchema, leadBulkStageQuery } from '@/services/leads-bulk';

export async function PATCH(request: NextRequest) {
  const denied = await guard(request,true,'leads.edit');
  if (denied) return denied;
  const parsed = leadBulkStageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error:'اختر من 1 إلى 50 عميلًا دون تكرار، ومرحلة صالحة.'},{status:400});
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({error:'يرجى تسجيل الدخول'},{status:401});
    if (!can(user.role,'leads.edit')) return NextResponse.json({error:'ليست لديك صلاحية لتعديل العملاء.'},{status:403});
    const scope = await allowedPageIds(user);
    const result = (await getDb().execute(leadBulkStageQuery(parsed.data,scope,user.email))).rows[0];
    if (Number(result.accessible)!==parsed.data.leads.length) return NextResponse.json({error:'أحد العملاء غير موجود أو غير متاح لك. لم تُعدّل الدفعة.'},{status:404});
    if (Number(result.changed)!==parsed.data.leads.length) return NextResponse.json({error:'تغيّر أحد العملاء منذ تحميل القائمة. أعد تحميلها قبل المحاولة؛ لم تُعدّل الدفعة.'},{status:409});
    return NextResponse.json({updated:Number(result.changed)});
  } catch {
    console.error('Lead bulk stage update unavailable',{code:'LEAD_BULK_UNAVAILABLE'});
    return NextResponse.json({error:'تعذر تحديث العملاء. أعد تحميل القائمة قبل المحاولة.'},{status:503});
  }
}

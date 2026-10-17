import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {and,eq,inArray,sql} from 'drizzle-orm';
import {getDb} from '@/db';
import {facebookPages} from '@/db/schema';
import {guard} from '@/services/api-guard';
import {getReachExperiment} from '@/services/reach-experiment';
import {EXPERIMENT_KEY,experimentSchema} from '@/services/reach-experiment-model';
import {logAudit} from '@/services/audit';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const denied=await guard(request,false,'settings.manage');if(denied)return denied;
 try{return NextResponse.json({experiment:await getReachExperiment()});}
 catch{console.error('Experiment read failed',{code:'REACH_EXPERIMENT_READ_FAILED'});return NextResponse.json({error:'تعذر قراءة التجربة'}, {status:503});}
}
export async function POST(request:NextRequest){
 const denied=await guard(request,true,'settings.manage');if(denied)return denied;
 const input=await request.json().catch(()=>null);
 if(input?.action!=='start'||Object.keys(input).length!==1)return NextResponse.json({error:'طلب غير صالح'}, {status:400});
 try{
  const pages=await getDb().select({id:facebookPages.id}).from(facebookPages).where(and(inArray(facebookPages.facebookPageId,['1330947143441946','881280065079565']),eq(facebookPages.platform,'facebook'),eq(facebookPages.isActive,true)));
  if(pages.length!==2)return NextResponse.json({error:'يجب أن تكون صفحتا رَصْدُوق وم. حبيب متصلتين ونشطتين'}, {status:409});
  const now=new Date(),value=experimentSchema.parse({id:randomUUID(),enabled:true,startsAt:now.toISOString(),endsAt:new Date(now.getTime()+7*86400000).toISOString(),pageIds:pages.map(p=>p.id)});
  const result=await getDb().execute(sql`INSERT INTO settings(key,value) VALUES(${EXPERIMENT_KEY},${JSON.stringify(value)}) ON CONFLICT(key) DO UPDATE SET value=CASE
   WHEN (settings.value::jsonb->>'enabled')::boolean AND (settings.value::jsonb->>'endsAt')::timestamptz>now() THEN settings.value ELSE EXCLUDED.value END,updated_at=now() RETURNING value`);
  const experiment=experimentSchema.parse(JSON.parse(String(result.rows[0].value)));
  await logAudit('reach_experiment.started','settings',null,{id:experiment.id,pageIds:experiment.pageIds,endsAt:experiment.endsAt,dailyNewsLimit:4});
  return NextResponse.json({experiment});
 }catch{console.error('Experiment start failed',{code:'REACH_EXPERIMENT_START_FAILED'});return NextResponse.json({error:'تعذر بدء التجربة'}, {status:503});}
}

'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LEAD_LABELS, LEAD_STAGES } from '@/services/leads-stages';
import { LeadBulkAssignment } from './lead-bulk-assignment';

export type LeadListRow={id:string;name:string;contact:string|null;source:string;status:string;pageName:string|null;updatedAt:string;version:string};
export function LeadListTable({rows,editable,assignable=false}:{rows:LeadListRow[];editable:boolean;assignable?:boolean}) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]);
  const [stage,setStage]=useState<typeof LEAD_STAGES[number]>('contacted');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [needsReload,setNeedsReload]=useState(false);
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const chosen=rows.filter(row=>selected.includes(row.id));
  function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);setNotice('');}
  async function save(){
    if(busy||pending.current||!chosen.length||needsReload)return;
    if(!window.confirm(`تغيير مرحلة ${chosen.length} عميلًا إلى «${LEAD_LABELS[stage]}»؟`))return;
    const controller=new AbortController();pending.current=controller;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/leads/bulk',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:stage,leads:chosen.map(row=>({id:row.id,expectedUpdatedAt:row.version}))}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(controller.signal.aborted)return;
      if(!response.ok){
        setError(response.status===409?'تغيّر أحد العملاء. أعد تحميل القائمة؛ لم تُعدّل الدفعة.':response.status===404?'أحد العملاء غير متاح. أعد تحميل القائمة؛ لم تُعدّل الدفعة.':response.status===403?'ليست لديك صلاحية لتعديل العملاء.':response.status===401?'انتهت الجلسة. سجّل الدخول مجددًا.':'تعذر تحديث العملاء. أعد تحميل القائمة للتحقق قبل المحاولة.');
        setNeedsReload(true);return;
      }
      setNotice(`حُدّثت مرحلة ${chosen.length} عميلًا.`);setSelected([]);router.refresh();
    }catch{
      if(!controller.signal.aborted){setError('تعذر تأكيد النتيجة. أعد تحميل القائمة للتحقق قبل المحاولة.');setNeedsReload(true);}
    }finally{pending.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="card card-flush" aria-busy={busy}>
    {editable&&rows.length>0?<div className="leads-filter" style={{padding:16}}>
      <span>المحدد: {chosen.length} · التحديد للصفحة الحالية فقط</span>
      <label>المرحلة الجديدة<select value={stage} disabled={busy||needsReload} onChange={event=>setStage(event.target.value as typeof stage)}>{LEAD_STAGES.map(value=><option key={value} value={value}>{LEAD_LABELS[value]}</option>)}</select></label>
      <button type="button" className="btn btn-primary" disabled={busy||needsReload||!chosen.length} onClick={()=>void save()}>{busy?'جارٍ التحديث…':'تغيير مرحلة المحددين'}</button>
      <button type="button" className="btn btn-secondary" disabled={busy||!chosen.length} onClick={()=>setSelected([])}>إلغاء التحديد</button>
      {needsReload?<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>window.location.reload()}>إعادة تحميل القائمة</button>:null}
    </div>:null}
    {assignable&&chosen.length?<div style={{padding:16}}><LeadBulkAssignment key={chosen.map(row=>`${row.id}:${row.version}`).sort().join(',')} rows={chosen} disabled={busy||needsReload} onBusy={setBusy} onSaved={()=>{setBusy(false);setNotice(`حُدّث إسناد ${chosen.length} عميلًا.`);setSelected([]);router.refresh();}} onUncertain={message=>{setError(message);setNeedsReload(true);}}/></div>:null}
    {error?<p role="alert" style={{padding:16}}>{error}</p>:null}{notice?<p role="status" style={{padding:16}}>{notice}</p>:null}
    <div className="table-wrap"><table><thead><tr>{editable?<th><input type="checkbox" aria-label="تحديد كل العملاء في الصفحة الحالية" disabled={busy||needsReload||!rows.length} checked={rows.length>0&&chosen.length===rows.length} onChange={event=>setSelected(event.target.checked?rows.map(row=>row.id):[])}/></th>:null}<th>العميل</th><th>المصدر</th><th>الصفحة</th><th>الحالة</th><th>آخر تحديث</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id}>{editable?<td><input type="checkbox" aria-label={`تحديد ${row.name}`} disabled={busy||needsReload} checked={selected.includes(row.id)} onChange={()=>toggle(row.id)}/></td>:null}
        <td><Link href={`/leads/${row.id}`}><strong>{row.name}</strong></Link>{row.contact?<small className="block">{row.contact}</small>:null}</td><td>{row.source==='messenger'?'Messenger':row.source==='manual'?'يدوي':'مصادر أخرى'}</td><td>{row.pageName??'—'}</td><td><span className="badge badge-info">{LEAD_LABELS[row.status as typeof stage]??'غير محددة'}</span></td><td><small>{new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(row.updatedAt))}</small></td></tr>)}
      {!rows.length?<tr><td colSpan={editable?6:5}><div className="empty-inline">لا يوجد عملاء محتملون بهذه الحالة بعد.</div></td></tr>:null}
    </tbody></table></div>
  </section>;
}

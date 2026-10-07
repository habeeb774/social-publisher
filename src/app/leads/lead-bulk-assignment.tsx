'use client';
import { useEffect,useRef,useState } from 'react';
import type { LeadListRow } from './lead-list-table';
type Member={id:string;name:string};
type Props={rows:LeadListRow[];disabled:boolean;onBusy:(busy:boolean)=>void;onSaved:()=>void;onUncertain:(message:string)=>void};
export function LeadBulkAssignment({rows,disabled,onBusy,onSaved,onUncertain}:Props){
  const [q,setQ]=useState(''),[items,setItems]=useState<Member[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [selected,setSelected]=useState('__unset'),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function lookup(more=false){
    if(disabled||pending.current||!rows.length)return;
    const controller=new AbortController();pending.current=controller;setLoading(true);setError('');
    if(!more){setItems([]);setCursor(null);setSelected('__unset');setLoaded(false);}
    try{
      const params=new URLSearchParams({q});for(const row of rows)params.append('lead',row.id);
      if(more&&cursor)params.set('cursor',cursor);
      const response=await fetch(`/api/leads/bulk/assignment?${params}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw new Error('LOOKUP_FAILED');
      const result=await response.json() as {items:Member[];cursor:string|null};
      if(controller.signal.aborted)return;
      if(!Array.isArray(result.items)||result.items.some(item=>typeof item.id!=='string'||typeof item.name!=='string')||(result.cursor!==null&&typeof result.cursor!=='string'))throw new Error('INVALID_RESPONSE');
      setItems(current=>more?[...current,...result.items.filter(item=>!current.some(existing=>existing.id===item.id))]:result.items);
      setCursor(result.cursor);setLoaded(true);
    }catch{if(!controller.signal.aborted)setError('تعذر تحميل الأعضاء المتاحين. اضغط بحث للمحاولة مجددًا.');}
    finally{pending.current=null;if(!controller.signal.aborted)setLoading(false);}
  }
  async function save(){
    if(disabled||pending.current||!rows.length||selected==='__unset')return;
    const label=selected==='__clear'?'إلغاء إسناد':`إسناد إلى «${items.find(item=>item.id===selected)?.name??'عضو الفريق'}»`;
    if(!window.confirm(`${label} للعملاء المحددين (${rows.length})؟`))return;
    const controller=new AbortController();pending.current=controller;onBusy(true);setError('');
    try{
      const response=await fetch('/api/leads/bulk/assignment',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({assignedTo:selected==='__clear'?null:selected,leads:rows.map(row=>({id:row.id,expectedUpdatedAt:row.version}))}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(controller.signal.aborted)return;
      if(!response.ok){onUncertain(response.status===409?'تغيرت بيانات العملاء أو صلاحيات العضو. أعد تحميل القائمة؛ لم تُعدّل الدفعة.':response.status===404?'أحد العملاء غير متاح. أعد تحميل القائمة؛ لم تُعدّل الدفعة.':response.status===403?'ليست لديك صلاحية لإسناد العملاء.':response.status===401?'انتهت الجلسة. سجّل الدخول مجددًا.':'تعذر تأكيد الإسناد. أعد تحميل القائمة قبل المحاولة.');return;}
      const result=await response.json() as {updated:number};
      if(result.updated!==rows.length)throw new Error('INVALID_RESPONSE');
      if(!controller.signal.aborted)onSaved();
    }catch{if(!controller.signal.aborted)onUncertain('تعذر تأكيد نتيجة الإسناد. أعد تحميل القائمة قبل المحاولة.');}
    finally{pending.current=null;if(!controller.signal.aborted)onBusy(false);}
  }
  return <div aria-busy={loading}><div className="leads-filter">
    <label>بحث عن عضو الفريق<input value={q} maxLength={100} disabled={disabled||loading} onChange={event=>{setQ(event.target.value);setItems([]);setCursor(null);setLoaded(false);setSelected('__unset');}}/></label>
    <button type="button" className="btn btn-secondary" disabled={disabled||loading} onClick={()=>void lookup()}>{loading?'جارٍ البحث…':'بحث عن الأعضاء المتاحين'}</button>
    <label>إسناد المحددين<select value={selected} disabled={disabled||loading} onChange={event=>setSelected(event.target.value)}><option value="__unset">اختر عضوًا أو ألغِ الإسناد</option><option value="__clear">إلغاء الإسناد</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {cursor?<button type="button" className="btn btn-secondary" disabled={disabled||loading} onClick={()=>void lookup(true)}>المزيد من الأعضاء</button>:null}
    <button type="button" className="btn btn-primary" disabled={disabled||loading||selected==='__unset'} onClick={()=>void save()}>حفظ إسناد المحددين</button>
  </div><small>تظهر فقط الأعضاء المخوّلون لمتابعة جميع العملاء المحددين.</small>
    {loaded&&!items.length?<p role="status">لا يوجد أعضاء متاحون في هذه الدفعة من النتائج.{cursor?' يمكنك تحميل المزيد.':''}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </div>;
}

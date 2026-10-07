"use client";
import Link from "next/link";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STAGES,LEAD_LABELS } from "@/services/leads-stages";
import type { LeadCard,LeadColumn } from "@/services/leads-board-data";
export function LeadBoard({initial,editable,q}:{initial:Record<string,LeadColumn>;editable:boolean;q:string}){
  const [columns,setColumns]=useState(initial),[busy,setBusy]=useState<string|null>(null),[dragged,setDragged]=useState<string|null>(null),[message,setMessage]=useState("");
  const locked=useRef(false),router=useRouter();
  async function move(card:LeadCard,status:string){
    if(!editable||locked.current||status===card.status)return;
    locked.current=true;setBusy(card.id);setMessage("");setDragged(null);
    try{
      const response=await fetch(`/api/leads/${card.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status,expectedUpdatedAt:card.updatedAt})});
      if(!response.ok){setMessage(response.status===409?"عُدّل العميل من نافذة أخرى؛ حدّث اللوحة قبل نقله.":response.status===403?"ليست لديك صلاحية لنقل العميل.":"تعذر نقل العميل. لم تتغير البطاقة؛ حاول مجددًا.");return;}
      const result=await response.json();
      if(typeof result.updated_at!=="string")throw new Error("INVALID_RESPONSE");
      setColumns(current=>Object.fromEntries(Object.entries(current).map(([stage,column])=>[stage,{...column,items:stage===status?[{...card,status,updatedAt:result.updated_at},...column.items.filter(item=>item.id!==card.id)]:column.items.filter(item=>item.id!==card.id)}])));
      setMessage(`تم نقل ${card.name} إلى ${LEAD_LABELS[status as keyof typeof LEAD_LABELS]}`);
    }catch{setMessage("تعذر التأكد من نتيجة النقل. حدّث اللوحة قبل المحاولة مجددًا.");}
    finally{locked.current=false;setBusy(null);}
  }
  async function more(stage:string){
    const cursor=columns[stage].cursor;if(!cursor||locked.current)return;
    locked.current=true;setBusy(stage);setMessage("");
    try{
      const response=await fetch(`/api/leads/board?${new URLSearchParams({status:stage,q,cursor})}`);
      if(!response.ok)throw new Error("UNAVAILABLE");
      const result:LeadColumn=await response.json();
      if(!Array.isArray(result.items))throw new Error("INVALID_RESPONSE");
      setColumns(current=>{const known=new Set(Object.values(current).flatMap(column=>column.items.map(item=>item.id)));return {...current,[stage]:{cursor:result.cursor,items:[...current[stage].items,...result.items.filter(item=>!known.has(item.id))]}};});
    }catch{setMessage("تعذر تحميل المزيد. حاول مجددًا.");}finally{locked.current=false;setBusy(null);}
  }
  return <section aria-label="مراحل العملاء">
    <div className="lead-board-tools"><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={()=>router.refresh()}>تحديث اللوحة</button>{!editable&&<span>عرض فقط</span>}<p role="status" aria-live="polite">{message}</p></div>
    <div className="lead-board">{LEAD_STAGES.map(stage=><section key={stage} className={`lead-board-column${dragged?" lead-drop-target":""}`} aria-label={LEAD_LABELS[stage]}
      onDragOver={event=>{if(editable&&dragged&&!busy)event.preventDefault();}}
      onDrop={event=>{event.preventDefault();const card=Object.values(columns).flatMap(column=>column.items).find(item=>item.id===dragged);if(card)void move(card,stage);}}>
      <h2>{LEAD_LABELS[stage]} <span className="badge badge-info">{columns[stage].items.length}</span></h2>
      {columns[stage].items.map(card=><article key={card.id} className="lead-board-card" draggable={editable&&!busy} aria-busy={busy===card.id}
        onDragStart={event=>{event.dataTransfer.setData("text/plain",card.id);event.dataTransfer.effectAllowed="move";setDragged(card.id);}} onDragEnd={()=>setDragged(null)}>
        <Link href={`/leads/${card.id}`}><strong>{card.name}</strong></Link>{card.contact&&<p>{card.contact}</p>}<small>{card.pageName??"بدون صفحة"}</small>
        {editable&&<label>نقل إلى<select aria-label={`نقل ${card.name} إلى مرحلة`} value={card.status} disabled={Boolean(busy)} onChange={event=>void move(card,event.target.value)}>{LEAD_STAGES.map(value=><option key={value} value={value}>{LEAD_LABELS[value]}</option>)}</select></label>}
      </article>)}
      {!columns[stage].items.length&&<p>لا يوجد عملاء بهذه المرحلة.</p>}
      {columns[stage].cursor&&<button className="btn btn-secondary" disabled={Boolean(busy)} onClick={()=>void more(stage)}>{busy===stage?"جارٍ التحميل…":"تحميل المزيد"}</button>}
    </section>)}</div>
  </section>;
}

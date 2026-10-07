"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
type Member={id:string;name:string};
export function LeadAssignment({id,version,assignedId,assignedName,editable}:{id:string;version:string;assignedId:string|null;assignedName:string|null;editable:boolean}){
  const router=useRouter(),lock=useRef(false);
  const [items,setItems]=useState<Member[]>([]),[q,setQ]=useState(""),[query,setQuery]=useState(""),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState(assignedId??""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[loaded,setLoaded]=useState(false);
  async function search(more=false){
    if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
    try{
      const params=new URLSearchParams({q:more?query:q});if(more&&cursor)params.set("cursor",cursor);
      const response=await fetch(`/api/leads/${id}/assignment?${params}`);if(!response.ok)throw new Error("FAILED");
      const result=await response.json();if(!Array.isArray(result.items))throw new Error("FAILED");
      setItems(current=>more?[...current,...result.items.filter((member:Member)=>!current.some(item=>item.id===member.id))]:result.items);setCursor(result.cursor);setQuery(more?query:q);setLoaded(true);
    }catch{setMessage("تعذر تحميل الأعضاء. حاول البحث مجددًا.");}finally{lock.current=false;setBusy(false);}
  }
  async function save(){
    if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/leads/${id}/assignment`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({assignedTo:selected||null,expectedUpdatedAt:version})});
      if(!response.ok){setMessage(response.status===409?"تغيرت البيانات. حدّث الصفحة قبل الحفظ.":response.status===400?"العضو غير متاح أو لا يملك صلاحية الصفحة.":"تعذر حفظ الإسناد.");return;}
      setMessage("تم حفظ الإسناد");router.refresh();
    }catch{setMessage("تعذر التأكد من الحفظ. حدّث الصفحة قبل المحاولة مجددًا.");}finally{lock.current=false;setBusy(false);}
  }
  return <section className="card stack" style={{gap:12}}><h2>مسؤول متابعة العميل</h2><p>{assignedName??(assignedId?"عضو الفريق":"غير مسند")}</p>
    {editable?<><form onSubmit={event=>{event.preventDefault();void search();}}><label>البحث عن عضو<input value={q} maxLength={100} disabled={busy} onChange={event=>setQ(event.target.value)}/></label><button className="btn btn-secondary" disabled={busy}>{busy?"جارٍ المعالجة…":"بحث / عرض الأعضاء"}</button></form>
      <label>إسناد إلى<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}><option value="">غير مسند</option>{assignedId&&!items.some(item=>item.id===assignedId)&&<option value={assignedId}>{assignedName??"المسؤول الحالي"}</option>}{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {loaded&&!items.length&&<p>لا يوجد أعضاء مؤهلون في هذه النتائج.</p>}{cursor&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void search(true)}>تحميل المزيد من الأعضاء</button>}
      <button className="btn btn-primary" disabled={busy||selected===(assignedId??"")} onClick={()=>void save()}>حفظ الإسناد</button></>:<p>عرض فقط؛ لا تملك صلاحية الإسناد.</p>}
    <p role="status" aria-live="polite">{message}</p><button className="btn btn-ghost" disabled={busy} onClick={()=>router.refresh()}>تحديث بيانات العميل</button>
  </section>;
}

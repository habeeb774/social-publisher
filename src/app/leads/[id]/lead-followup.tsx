"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LeadFollowup({ id, version, dueAt, completedAt, editable }: { id:string; version:string; dueAt:string|null; completedAt:string|null; editable:boolean }) {
  const router=useRouter();
  const [date,setDate]=useState(()=>dueAt?new Date(new Date(dueAt).getTime()+3*3600000).toISOString().slice(0,16):"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  async function save(action:"schedule"|"complete"|"cancel") {
    if(busy)return;
    setError("");setSaved(false);
    let due:string|undefined;
    if(action==="schedule") {
      const parsed=new Date(`${date}:00+03:00`);
      if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||new Date(parsed.getTime()+3*3600000).toISOString().slice(0,16)!==date){setError("اختر تاريخًا ووقتًا صالحين");return;}
      due=parsed.toISOString();
    }
    setBusy(true);
    try {
      const response=await fetch(`/api/leads/${id}/followup`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,expectedUpdatedAt:version,...(due?{dueAt:due}:{})})});
      const body=await response.json().catch(()=>null);
      if(!response.ok){setError(typeof body?.error==="string"?body.error:"تعذر حفظ المتابعة. حاول مجددًا.");return;}
      setSaved(true);router.refresh();
    } catch {setError("تعذر الاتصال. تحقق من الشبكة وحاول مجددًا.");}
    finally {setBusy(false);}
  }
  return <section className="card" aria-busy={busy}>
    <h2>متابعة العميل</h2>
    <p>{dueAt?`${completedAt?"متابعة مكتملة":"موعد المتابعة"} · ${new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date(dueAt))}`:"لا يوجد موعد متابعة محدد."}</p>
    <p>جميع المواعيد بتوقيت الرياض. تذكير داخل النظام عند تشغيل العامل بعد استحقاق الموعد.</p>
    {editable?<><label htmlFor="lead-followup-date">موعد المتابعة</label><input id="lead-followup-date" type="datetime-local" value={date} onChange={event=>setDate(event.target.value)} disabled={busy} />
      <div className="actions" style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
        <button type="button" className="btn btn-primary" disabled={busy||!date} onClick={()=>void save("schedule")}>{busy?"جارٍ الحفظ…":"حفظ موعد المتابعة"}</button>
        {dueAt&&!completedAt?<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void save("complete")}>تم التواصل والمتابعة</button>:null}
        {dueAt?<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{if(window.confirm("إلغاء موعد المتابعة لهذا العميل؟"))void save("cancel");}}>إلغاء الموعد</button>:null}
      </div></>:<p>يمكنك مشاهدة الموعد دون تعديله.</p>}
    {error?<div role="alert" className="alert alert-warning">{error} <button className="btn btn-secondary" type="button" onClick={()=>router.refresh()}>إعادة تحميل البيانات</button></div>:null}
    {saved?<p role="status">حُفظت المتابعة بنجاح.</p>:null}
  </section>;
}

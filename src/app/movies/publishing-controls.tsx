"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {api} from "../ui/api";
import styles from "./movies.module.css";
type Platform="facebook"|"youtube";
type State=Record<Platform,{enabled:boolean;available:boolean}>;
const platforms:Platform[]=["facebook","youtube"];
const labels={facebook:"Facebook",youtube:"YouTube"};
export function MoviePublishingControls({canManage}:{canManage:boolean}){
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const sequence=useRef({value:0}),saving=useRef(false);
 const [pending,setPending]=useState<{platform:Platform;enabled:boolean}|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;if(!element)return;
  if(pending&&!element.open)element.showModal();else if(!pending&&element.open)element.close();
 },[pending]);
 const load=useCallback(async()=>{const version=sequence.current,n=++version.value;try{const result=await api<State>("/api/movies/publishing");if(n===version.value){setData(result);setError("");}}
  catch(e){if(n===version.value)setError(e instanceof Error?e.message:"تعذر قراءة حالة النشر");}},[]);
 useEffect(()=>{const version=sequence.current;let active=true;void Promise.resolve().then(()=>{if(active)void load();});
  const timer=setInterval(()=>{if(document.visibilityState==="visible"&&!saving.current)void load();},15000);
  return()=>{active=false;++version.value;clearInterval(timer);};},[load]);
 async function toggle(platform:Platform,enabled:boolean){
  if(saving.current)return;
  saving.current=true;++sequence.current.value;setBusy(true);setError("");setNotice("");
  try{const result=await api<State>("/api/movies/publishing",{method:"PUT",body:{platform,enabled,confirmed:true}});setData(result);
   setNotice(`${labels[platform]}: ${enabled?"تم تشغيل النشر":"تم إيقاف النشر"}`);setPending(null);window.dispatchEvent(new Event("movie-publishing-changed"));}
  catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة النشر");}
  finally{saving.current=false;setBusy(false);}
 }
 return <section className="card stack" style={{padding:24}} aria-label="التحكم في نشر ريلز الأفلام"><h2>تشغيل وإيقاف النشر</h2>
  <p className="hint">للأفلام والريلز فقط؛ لا يؤثر على منشورات الناشر العام. التشغيل لا يتجاوز الحقوق أو الاعتماد. الإيقاف يحفظ الجدولة ولا يحذف أي فيديو منشور. عند التشغيل تُستأنف المواعيد المستحقة.</p>
  {!data&&!error?<p role="status">جارٍ قراءة حالة النشر…</p>:null}
  {platforms.map(platform=><div className="stack" key={platform}><strong>{labels[platform]}: {data?(data[platform].enabled?"النشر مفعّل":"النشر متوقف"):"—"}</strong>
   {canManage?<div className="row-actions"><button type="button" className="btn btn-primary" disabled={busy||!data||!data[platform].available||data[platform].enabled} onClick={()=>{setError("");setPending({platform,enabled:true});}}>▶ تشغيل {labels[platform]}</button>
    <button type="button" className="btn btn-secondary" disabled={busy||!data||!data[platform].enabled} onClick={()=>{setError("");setPending({platform,enabled:false});}}>■ إيقاف {labels[platform]}</button></div>:null}
   {data&&!data[platform].available?<p className="hint">إعداد المنصة غير مكتمل.</p>:null}</div>)}
  {notice?<p role="status">{notice}</p>:null}{error?<p role="alert" className="banner">{error}</p>:null}
  <dialog ref={dialog} className={styles.publishingDialog} aria-labelledby="publishing-confirm-title" aria-describedby="publishing-confirm-description"
   onCancel={event=>{event.preventDefault();if(!saving.current)setPending(null);}}>
   {pending?<div className="stack"><h2 id="publishing-confirm-title">{pending.enabled?"تشغيل":"إيقاف"} النشر على {labels[pending.platform]}</h2>
    <p id="publishing-confirm-description">{pending.enabled?
     "ستُنشر ريلز الأفلام المجدولة عند حلول موعدها، فقط إذا كانت معتمدة وحقوقها موثقة. ستُستأنف المواعيد المستحقة السابقة أيضًا.":
     "ستتوقف عمليات النشر الجديدة مع بقاء المواعيد محفوظة. لن تُحذف الفيديوهات المنشورة، ولا يمكن سحب رفع بدأ بالفعل."}</p>
    {error?<p role="alert" className="banner">{error}</p>:null}
    <div className="row-actions"><button type="button" className="btn btn-secondary" autoFocus disabled={busy} onClick={()=>setPending(null)}>إلغاء</button>
     <button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void toggle(pending.platform,pending.enabled)}>{busy?"جارٍ الحفظ…":pending.enabled?"تأكيد التشغيل":"تأكيد الإيقاف"}</button></div>
   </div>:null}
  </dialog>
 </section>;
}

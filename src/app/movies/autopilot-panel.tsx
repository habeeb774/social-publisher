"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {api} from "../ui/api";
type Policy={enabled:boolean;pageId:string;channelId:string;madeForKids:boolean};
type Status={policy:Policy|null;films:Array<{id:string;title:string;licensePage:string}>;imports:Array<{movieId:string;catalogId:string;state:string;error:string|null;qualityChecked:number}>};
const states:Record<string,string>={queued:"بانتظار العامل",downloading:"جارٍ التنزيل والرفع",ready:"المصدر محفوظ — المعالجة والجدولة تتقدمان تلقائيًا",blocked:"متوقف للمراجعة"};
export function MovieAutopilot({canManage,pages}:{canManage:boolean;pages:Array<{id:string;name:string}>}){
 const [data,setData]=useState<Status|null>(null),[channels,setChannels]=useState<Array<{id:string;title:string}>>([]),[page,setPage]=useState(""),[channel,setChannel]=useState(""),[kids,setKids]=useState(""),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const seq=useRef({value:0});
 const load=useCallback(async()=>{const version=seq.current,n=++version.value;try{const [result,linked]=await Promise.all([api<Status>("/api/movies/autopilot"),api<{channels:Array<{id:string;title:string}>}>("/api/youtube/channels")]);
  if(n===version.value){setData(result);setChannels(linked.channels);if(result.policy){setPage(result.policy.pageId);setChannel(result.policy.channelId);setKids(String(result.policy.madeForKids));}setError("");}}
  catch(e){if(n===version.value)setError(e instanceof Error?e.message:"تعذر قراءة الأتمتة");}},[]);
 useEffect(()=>{const version=seq.current;let active=true;void Promise.resolve().then(()=>{if(active)void load();});const interval=setInterval(()=>{if(document.visibilityState==="visible")void load();},15000);
  return()=>{active=false;++version.value;clearInterval(interval);};},[load]);
 async function save(enabled:boolean){if(busy)return;setBusy(true);setError("");try{await api("/api/movies/autopilot",{method:"PUT",body:{enabled,pageId:page,channelId:channel,madeForKids:kids==="true",confirmed:true}});await load();}
  catch(e){setError(e instanceof Error?e.message:"تعذر حفظ الأتمتة");}finally{setBusy(false);}}
 return <section className="card stack" style={{padding:24}} aria-label="أتمتة الأفلام المرخصة"><h2>أتمتة الأفلام المرخصة</h2>
  <p>Big Buck Bunny وTears of Steel فقط · تنزيل خاص، اختيار مشاهد، ترجمة عربية، اعتماد تقني آلي، جدولة 5 ريلز يوميًا لكل منصة.</p>
  <p className="hint">يُحفظ دليل CC BY 3.0 ويضاف نسب العمل والتعديلات لكل منشور. الاعتماد الآلي ليس مراجعة بشرية للترجمة. الفشل يتوقف للمراجعة. لا تتكرر الأفلام بعد انتهاء القائمة، ولا تُعتمد أفلامك الأخرى تلقائيًا.</p>
  {canManage?<fieldset className="stack" disabled={busy}><legend>سياسة القائمة المعتمدة</legend>
   <label>صفحة Facebook<select value={page} disabled={Boolean(data?.policy)} onChange={e=>setPage(e.currentTarget.value)}><option value="">اختر الصفحة</option>{pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>قناة YouTube<select value={channel} disabled={Boolean(data?.policy)} onChange={e=>setChannel(e.currentTarget.value)}><option value="">اختر القناة</option>{channels.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
   <label>جمهور YouTube<select value={kids} disabled={Boolean(data?.policy)} onChange={e=>setKids(e.currentTarget.value)}><option value="">اختر بنفسك</option><option value="false">ليست موجّهة للأطفال</option><option value="true">موجّهة للأطفال</option></select></label>
   <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.currentTarget.checked)}/> أعتمد سياسة الفيلمين المحددين وأسمح بالاعتماد الآلي والنشر العام على الوجهتين وفق الترخيص، مع حفظ النسب والمواعيد.</label>
   <div className="row-actions"><button type="button" className="btn btn-primary" disabled={!consent||!page||!channel||!kids||data?.policy?.enabled} onClick={()=>void save(true)}>تشغيل الأتمتة للفيلمين</button>
    <button type="button" className="btn btn-secondary" disabled={!data?.policy?.enabled} onClick={()=>void save(false)}>إيقاف الأتمتة</button></div>
  </fieldset>:null}
  <p role="status">الأتمتة: {data?.policy?.enabled?"مفعّلة":"متوقفة"} · أزرار نشر المنصتين تبقى مستقلة.</p>
  {data?.imports.map(item=><div key={item.movieId}><strong>{data.films.find(f=>f.id===item.catalogId)?.title}</strong><p>{states[item.state]??item.state} · فحوص المقاطع: {item.qualityChecked}{item.error?` · ${item.error}`:""}</p></div>)}
  {error?<p role="alert" className="banner">{error}</p>:null}
 </section>;
}

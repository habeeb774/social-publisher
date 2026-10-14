"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {api,riyadh} from "../ui/api";

type Channel={id:string;title:string;channel_id:string};
type Channels={enabled:boolean;configured:boolean;publishing:boolean;channels:Channel[]};
type Publication={id:string;part_number:number;channel_title:string;scheduled_at:string;privacy:string;status:string;remote_video_id:string|null;error_code:string|null};
type Detail={enabled:boolean;publishing:boolean;rightsVerified:boolean;publications:Publication[]};
export const YOUTUBE_STATUS:Record<string,string>={scheduled:"مجدول",uploading:"جارٍ الرفع",processing:"YouTube يعالج الفيديو",published:"منشور للعامة",private:"مرفوع — خاص",
 unlisted:"مرفوع — غير مدرج",failed:"فشل",outcome_unknown:"نتيجة غير مؤكدة — تحقق من YouTube Studio",cancelled:"ملغى"};
const startTime=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})
 .format(new Date(Date.now()+3600000)).replace(" ","T");
export function YouTubeConnection({canManage}:{canManage:boolean}){
 const [data,setData]=useState<Channels|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const request=useRef({value:0});
 const load=useCallback(async()=>{const version=request.current,n=++version.value;try{const result=await api<Channels>("/api/youtube/channels");if(n===version.value)setData(result);}
  catch(e){if(n===version.value)setError(e instanceof Error?e.message:"تعذر تحميل القنوات");}},[]);
 useEffect(()=>{const version=request.current;let active=true;void Promise.resolve().then(()=>{if(!active)return;void load();const result=new URLSearchParams(window.location.search).get("youtube");
  if(result){const messages:Record<string,string>={connected:"تم ربط قناة YouTube",cancelled:"أُلغيت موافقة Google",'invalid-state':"انتهت جلسة الربط؛ ابدأ من الزر مجددًا",
   'connection-failed':"تعذر ربط القناة؛ تحقق من صلاحيات Google واختيار قناة واحدة",'channel-already-linked':"القناة مرتبطة بحساب مدير آخر؛ استخدم حساب الربط الأصلي",'missing-config':"أكمل إعداد Google أولًا"};
   setNotice(messages[result]??"راجع حالة الربط أدناه");}
  });const refresh=()=>{void load();};window.addEventListener("movie-publishing-changed",refresh);
  return()=>{active=false;++version.value;window.removeEventListener("movie-publishing-changed",refresh);};},[load]);
 async function connect(){setBusy(true);setError("");try{const result=await api<{url:string}>("/api/youtube/connect",{method:"POST"});
  const url=new URL(result.url);if(url.origin!=="https://accounts.google.com")throw new Error("رابط الربط غير صالح");window.location.assign(url.href);
 }catch(e){setError(e instanceof Error?e.message:"تعذر الربط");setBusy(false);}}
 async function disconnect(channel:Channel){
  if(!window.confirm(`فك ربط «${channel.title}» وسحب صلاحية التطبيق في Google وإلغاء مواعيدها المنتظرة؟ الفيديوهات الموجودة لن تُحذف.`))return;
  setBusy(true);setError("");try{await api("/api/youtube/disconnect",{method:"POST",body:{channelId:channel.id,confirmed:true}});setNotice("أُلغي الربط؛ لم تُحذف الفيديوهات من YouTube");}
  catch(e){setError(e instanceof Error?e.message:"تعذر فك الربط");}finally{setBusy(false);await load();}
 }
 return <section className="card stack" style={{padding:24}} aria-label="ربط YouTube"><h2>YouTube Shorts</h2>
  <p className="hint">ربط القناة مستقل عن Facebook. تحتاج المقاطع اعتمادًا وترخيصًا يسمح بالنشر على YouTube.</p>
  {!data&&!error?<p role="status">جارٍ تحميل الربط…</p>:null}
  {data&&!data.enabled?<p className="banner">تكامل YouTube جاهز للإعداد؛ يلزم إضافة بيانات Google وترحيل الجداول ثم تفعيله.</p>:null}
  {data?.enabled&&!data.configured?<p className="banner">بيانات OAuth الخاصة بـGoogle غير مكتملة.</p>:null}
  {data?.enabled?<p>الناشر التلقائي: {data.publishing?"مفعّل":"متوقف — الجدولة لا تعني التفعيل"}</p>:null}
  {canManage?<button type="button" className="btn btn-secondary" disabled={busy||!data?.enabled||!data.configured} onClick={()=>void connect()}>ربط قناة YouTube بحساب Google</button>:null}
  {data?.channels.map(channel=><div key={channel.id} className="row-between"><a href={`https://www.youtube.com/channel/${encodeURIComponent(channel.channel_id)}`} target="_blank" rel="noopener noreferrer">{channel.title}</a>
   {canManage?<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>void disconnect(channel)}>فك الربط</button>:null}</div>)}
  {notice?<p role="status" className="banner">{notice}</p>:null}{error?<p role="alert" className="banner">{error}</p>:null}
 </section>;
}
export function YouTubeMovie({movieId,revision,rightsStatus,canReview,canPublish}:{movieId:string;revision:number;rightsStatus:string;canReview:boolean;canPublish:boolean}){
 const [data,setData]=useState<Detail|null>(null),[channels,setChannels]=useState<Channel[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [evidence,setEvidence]=useState(""),[checked,setChecked]=useState(false),[channel,setChannel]=useState(""),[start,setStart]=useState(startTime);
 const [privacy,setPrivacy]=useState("private"),[kids,setKids]=useState(""),[synthetic,setSynthetic]=useState("");
 const seq=useRef({value:0});
 const load=useCallback(async()=>{const version=seq.current,n=++version.value;try{const [detail,connections]=await Promise.all([api<Detail>(`/api/movies/${movieId}/youtube`),api<Channels>("/api/youtube/channels")]);
  if(n===version.value){setData(detail);setChannels(connections.channels);setError("");}}
  catch(e){if(n===version.value)setError(e instanceof Error?e.message:"تعذر تحميل جدول YouTube");}},[movieId]);
 useEffect(()=>{const version=seq.current;let active=true;void Promise.resolve().then(()=>{if(active)void load();});const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);
  return()=>{active=false;++version.value;clearInterval(timer);};},[load,revision,rightsStatus]);
 async function act(url:string,body:unknown,message:string){if(busy)return;setBusy(true);setError("");setNotice("");
  try{await api(url,{method:"POST",body});await load();setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ الإجراء");}finally{setBusy(false);}}
 if(data&&!data.enabled)return null;
 return <section className="card stack" style={{padding:24}} aria-label="جدولة YouTube"><h3>حقوق وجدولة YouTube</h3>
  {error?<p role="alert" className="banner">{error}</p>:null}{notice?<p role="status" className="banner">{notice}</p>:null}
  {!data?<p role="status">جارٍ تحميل YouTube…</p>:<>
   <p>حقوق YouTube: {data.rightsVerified?"موثقة لهذه النسخة":"بانتظار مراجعة ترخيص YouTube"}</p>
   {canReview?<fieldset className="stack" disabled={busy}><legend>مراجعة نطاق الترخيص</legend>
    <p className="hint">لا يكفي الإقرار بالملكية. يلزم دليل يسمح بالنشر على YouTube واستخراج المقتطفات، وتوثيق الحقوق الأصلية أولًا.</p>
    <label>دليل الترخيص وملاحظة المراجع<textarea value={evidence} maxLength={2000} rows={3} onChange={e=>setEvidence(e.currentTarget.value)}/></label>
    <label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.currentTarget.checked)}/> فحصتُ الدليل وهو يسمح بنشر المقتطفات على YouTube</label>
    <div className="row-actions"><button type="button" className="btn btn-secondary" disabled={!checked||evidence.trim().length<10||rightsStatus!=="verified"} onClick={()=>void act(`/api/movies/${movieId}/youtube/rights`,{
     decision:"verified",expectedRevision:revision,evidence,youtubeAllowed:true,excerptsAllowed:true,evidenceReviewed:true},"وُثّقت حقوق YouTube")}>توثيق حقوق YouTube</button>
    {data.rightsVerified?<button type="button" className="btn btn-ghost" disabled={!checked||evidence.trim().length<10} onClick={()=>void act(`/api/movies/${movieId}/youtube/rights`,{
     decision:"revoked",expectedRevision:revision,evidence,youtubeAllowed:true,excerptsAllowed:true,evidenceReviewed:true},"سُحبت موافقة YouTube وأُلغيت المواعيد المنتظرة")}>سحب موافقة YouTube</button>:null}</div>
   </fieldset>:null}
   {canPublish?<fieldset className="stack" disabled={busy||!data.rightsVerified}><legend>جدولة المقاطع المعتمدة على القناة</legend>
    <p className="hint">5 مقاطع يوميًا بتوقيت الرياض. يمكن نشر نفس المقطع على Facebook وYouTube بحالتين مستقلتين.</p>
    <label>قناة YouTube<select value={channel} onChange={e=>setChannel(e.currentTarget.value)}><option value="">اختر القناة</option>{channels.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
    <label>بداية النشر على YouTube (توقيت الرياض)<input type="datetime-local" value={start} onChange={e=>setStart(e.currentTarget.value)}/></label>
    <label>ظهور الفيديو<select value={privacy} onChange={e=>setPrivacy(e.currentTarget.value)}><option value="private">خاص — لا يظهر للعامة</option><option value="unlisted">غير مدرج — متاح بالرابط</option><option value="public">عام — يظهر للجميع</option></select></label>
    <label>هل المحتوى مخصّص للأطفال؟<select value={kids} onChange={e=>setKids(e.currentTarget.value)}><option value="">اختر بعد مراجعة المحتوى</option><option value="yes">نعم</option><option value="no">لا</option></select></label>
    <label>هل يتضمن محتوى واقعيًا معدّلًا أو مولّدًا اصطناعيًا؟<select value={synthetic} onChange={e=>setSynthetic(e.currentTarget.value)}><option value="">اختر بعد مراجعة المحتوى</option><option value="yes">نعم</option><option value="no">لا</option></select></label>
    {!data.publishing?<p className="banner">الناشر التلقائي لـYouTube متوقف حاليًا؛ ستنتظر المواعيد حتى تفعيله.</p>:null}
    <button type="button" className="btn btn-primary" disabled={!channel||!start||!kids||!synthetic||!Number.isFinite(Date.parse(`${start}:00+03:00`))}
     onClick={()=>void act(`/api/movies/${movieId}/youtube`,{channelId:channel,start:new Date(`${start}:00+03:00`).toISOString(),privacy,madeForKids:kids==="yes",syntheticMedia:synthetic==="yes"},"حُجزت مواعيد YouTube")}>حجز مواعيد YouTube</button>
   </fieldset>:null}
   {data.publications.length?<div className="responsive-table"><table className="data-table"><thead><tr><th>الجزء</th><th>القناة</th><th>الموعد (الرياض)</th><th>الحالة</th><th>الفيديو</th>{canPublish?<th>إجراء</th>:null}</tr></thead>
    <tbody>{data.publications.map(p=><tr key={p.id}><td>{p.part_number}</td><td>{p.channel_title}</td><td>{riyadh(p.scheduled_at)}</td><td>{YOUTUBE_STATUS[p.status]??p.status}{p.error_code?<small className="cell-error">{p.error_code}</small>:null}</td>
     <td>{p.remote_video_id?<a href={`https://www.youtube.com/watch?v=${encodeURIComponent(p.remote_video_id)}`} target="_blank" rel="noopener noreferrer">فتح الفيديو</a>:"—"}</td>
     {canPublish?<td>{p.status==="scheduled"?<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>void act(`/api/movies/${movieId}/youtube/publications/${p.id}`,{action:"cancel"},"أُلغي الموعد؛ لم يُحذف أي فيديو")}>إلغاء الموعد</button>:null}</td>:null}</tr>)}</tbody>
   </table></div>:<p className="hint">لا توجد مواعيد YouTube لهذا الفيلم.</p>}
  </>}
 </section>;
}

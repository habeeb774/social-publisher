"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {api,riyadh} from "../ui/api";
import {directMovieUpload,putMoviePart,UploadCompletionUnknown,type UploadProgress} from "./direct-upload";

type Cue={start:number;end:number;text:string};
type Clip={id:string;part_number:number;start_ms:number;title:string;description:string;captions:Cue[];revision:number;subtitle_reviewed:boolean;status:string;
  scheduled_at:string|null;remote_permalink:string|null;previewUrl:string|null};
type Job={id:string;kind:string;status:string;progress:number;attempts:number;error_message:string|null};
type Publication={id:string;part_number:number;page_name:string|null;scheduled_at:string;status:string;attempts:number;remote_permalink:string|null;remote_reel_id:string|null;error_code:string|null};
type Detail={movie:{id:string;title:string;status:string;rights_status:string;rights_revision:number;page_id:string|null;hasSource:boolean;ownedByMe:boolean;rights_expires_at:string|null};
  clips:Clip[];jobs:Job[];publications:Publication[];rightsHistory:Array<{decision:string;note:string;created_at:string;reviewer:string|null}>;storageConfigured:boolean};
type Page={id:string;name:string};
export const CLIP_STATUS:Record<string,string>={processing:"قيد المعالجة",rendering:"إعادة إخراج الترجمة",pending_approval:"بانتظار المراجعة",approved:"معتمد",rejected:"مرفوض",excluded:"مستبعد",
  scheduled:"مجدول",published:"منشور",render_failed:"تعذر الإخراج"};
export const PUBLICATION_STATUS:Record<string,string>={scheduled:"مجدول",publishing:"جارٍ النشر",processing:"تعالجه Meta",published:"منشور",failed:"فشل",outcome_unknown:"نتيجة غير مؤكدة — تحقق من الصفحة",cancelled:"ملغى"};
const tone=(status:string)=>["approved","published"].includes(status)?"badge-success":["rejected","failed","render_failed","outcome_unknown"].includes(status)?"badge-danger":["scheduled","publishing"].includes(status)?"badge-info":status==="excluded"?"badge-neutral":"badge-warning";

/** "1.5-3 نص" per line; keeps editing plain-text friendly for Arabic reviewers. */
export function parseCaptions(text:string):Cue[]{
  return text.split("\n").map(line=>line.trim()).filter(Boolean).map((line,i)=>{
    const match=/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s+(.+)$/.exec(line);
    if(!match)throw new Error(`السطر ${i+1}: استخدم الصيغة «البداية-النهاية النص» بالثواني`);
    return {start:Number(match[1]),end:Number(match[2]),text:match[3]};
  });
}
export const formatCaptions=(cues:Cue[])=>cues.map(cue=>`${+cue.start.toFixed(2)}-${+cue.end.toFixed(2)} ${cue.text}`).join("\n");
const riyadhInput=(date:Date)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date).replace(" ","T");

export function MovieDetail({movieId,pages,canWrite,canReview,canPublish,onChanged}:{movieId:string;pages:Page[];canWrite:boolean;canReview:boolean;canPublish:boolean;onChanged:()=>void}){
  const [detail,setDetail]=useState<Detail|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [subtitlesChecked,setSubtitlesChecked]=useState(false);
  const [progress,setProgress]=useState<UploadProgress|null>(null);
  const upload=useRef<AbortController|null>(null);
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const request=++sequence.current;
    try {const data=await api<Detail>(`/api/movies/${movieId}`);if(request===sequence.current){setDetail(data);setError("");}}
    catch(cause){if(request===sequence.current)setError(cause instanceof Error?cause.message:"تعذر تحميل الفيلم");}
  },[movieId]);
  useEffect(()=>{
    const requests=sequence,uploads=upload;
    const request=++requests.current;
    void api<Detail>(`/api/movies/${movieId}`)
      .then(data=>{if(request===requests.current)setDetail(data);})
      .catch(cause=>{if(request===requests.current)setError(cause instanceof Error?cause.message:"تعذر تحميل الفيلم");});
    const timer=setInterval(()=>{if(document.visibilityState==="visible"&&!uploads.current)void load();},15000);
    return()=>{clearInterval(timer);++requests.current;uploads.current?.abort();};
  },[movieId,load]);

  async function act(action:()=>Promise<unknown>,success:string){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try {await action();setNotice(success);await load();onChanged();}
    catch(cause){setError(cause instanceof Error?cause.message:"تعذر تنفيذ الإجراء");}
    finally{setBusy(false);}
  }
  async function startUpload(file:File){
    if(upload.current)return;
    const controller=new AbortController();upload.current=controller;setError("");setNotice("");
    try {
      await directMovieUpload(file,{
        initiate:metadata=>api<{id:string}>(`/api/movies/${movieId}/upload`,{method:"POST",body:metadata}),
        sign:(session,number)=>api<{url:string;size:number}>(`/api/movies/${movieId}/upload/${session}`,{method:"POST",body:{action:"sign",number}}),
        complete:async(session,parts)=>{await api(`/api/movies/${movieId}/upload/${session}`,{method:"POST",body:{action:"complete",parts}});},
        abort:async session=>{await api(`/api/movies/${movieId}/upload/${session}`,{method:"POST",body:{action:"abort"}});},
        put:putMoviePart,
      },controller.signal,setProgress);
      setNotice("اكتمل الرفع وتحقق الخادم من الملف. دخل الفيلم طابور المعالجة.");
    } catch(cause){
      setError(cause instanceof UploadCompletionUnknown?"انقطع الاتصال أثناء تأكيد الرفع. حدّث الصفحة بعد دقيقة للتحقق قبل إعادة الرفع.":cause instanceof Error&&cause.message==="MOVIE_UPLOAD_CANCELLED"?"أُلغي الرفع.":cause instanceof Error?cause.message:"تعذر الرفع");
    } finally {upload.current=null;setProgress(null);await load();onChanged();}
  }

  if(!detail)return <section className="card" style={{padding:24}} aria-busy="true">{error?<p className="banner" role="alert">{error}</p>:<p role="status">جارٍ تحميل الفيلم…</p>}</section>;
  const {movie,clips,jobs,publications}=detail;
  const job=jobs.find(item=>item.kind==="process");
  const reviewable=clips.filter(clip=>["pending_approval","rejected","excluded"].includes(clip.status));
  const approved=clips.filter(clip=>clip.status==="approved");
  const chosen=clips.filter(clip=>selected.has(clip.id));
  const review=(decision:"approved"|"rejected"|"excluded",items:Clip[])=>act(()=>api(`/api/movies/${movieId}/clips/review`,{method:"POST",body:{decision,items:items.map(clip=>({clipId:clip.id,revision:clip.revision})),subtitlesReviewed:decision==="approved"?subtitlesChecked:false}}).then(()=>setSelected(new Set())),
    decision==="approved"?`اعتُمد ${items.length} مقطع`:decision==="rejected"?"رُفضت المقاطع المختارة":"استُبعدت المقاطع المختارة");

  return <section className="stack">
    <div className="card stack" style={{padding:24}}>
      <div className="row-between"><h2>{movie.title}</h2><button type="button" className="btn btn-secondary btn-sm" onClick={()=>void load()} disabled={busy}>تحديث</button></div>
      <p>الحقوق: <span className={`badge ${movie.rights_status==="verified"?"badge-success":movie.rights_status==="pending"?"badge-warning":"badge-danger"}`}>{({pending:"بانتظار التحقق",verified:"موثقة",rejected:"مرفوضة",revoked:"ملغاة"} as Record<string,string>)[movie.rights_status]??movie.rights_status}</span>
        {movie.rights_expires_at&&<> · تنتهي {riyadh(movie.rights_expires_at)}</>}</p>
      {notice&&<p className="banner" role="status">{notice}</p>}
      {error&&<p className="banner" role="alert">{error}</p>}
      {!detail.storageConfigured&&<p className="banner">التخزين الخاص غير مهيأ بعد؛ الرفع والمعاينة غير متاحين حتى إضافة إعدادات MOVIE_S3_*.</p>}
    </div>

    {canReview&&<RightsReview movie={movie} busy={busy} onSubmit={body=>act(()=>api(`/api/movies/${movieId}/rights`,{method:"POST",body}),"حُفظ قرار الحقوق")}/>}

    {!movie.hasSource&&canWrite&&(movie.ownedByMe||canPublish)&&<div className="card stack" style={{padding:24}}>
      <h3>رفع ملف الفيلم</h3>
      <p className="hint">MP4 أو MOV حتى 50GB. يُرفع الملف مباشرة إلى التخزين الخاص على أجزاء 64MB، ولا يمر عبر خوادم الموقع.</p>
      {progress?<div className="stack">
        <progress max={progress.total} value={progress.loaded} style={{width:"100%"}}/>
        <p role="status">{progress.phase==="verifying"?"جارٍ التحقق من الملف…":`${Math.floor(progress.loaded/progress.total*100)}% · ${(progress.loaded/1024**3).toFixed(2)} من ${(progress.total/1024**3).toFixed(2)} GB`}</p>
        {progress.phase==="uploading"&&<button type="button" className="btn btn-danger btn-sm" onClick={()=>upload.current?.abort()}>إلغاء الرفع</button>}
      </div>:<input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" disabled={busy||!detail.storageConfigured||!["pending","verified"].includes(movie.rights_status)}
        onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void startUpload(file);}}/>}
      <ResumeUpload movieId={movieId} hidden={Boolean(progress)} onDone={()=>void load()}/>
    </div>}

    {movie.hasSource&&<div className="card stack" style={{padding:24}}>
      <h3>المعالجة</h3>
      {job?<><progress max={100} value={job.progress} style={{width:"100%"}}/>
        <p>{({queued:"في الطابور — بانتظار عامل المعالجة",running:`جارٍ التقطيع والترجمة (محاولة ${job.attempts})`,done:"اكتملت المعالجة",failed:"تعذرت المعالجة"} as Record<string,string>)[job.status]??job.status}
          {job.error_message&&job.status!=="done"&&<small> · {job.error_message}</small>}</p></>:<p>بانتظار إنشاء مهمة المعالجة.</p>}
      {jobs.filter(item=>item.kind==="rerender"&&item.status!=="done").length>0&&<p className="hint">إعادة إخراج ترجمات معدّلة: {jobs.filter(item=>item.kind==="rerender"&&item.status!=="done").length}</p>}
    </div>}

    {clips.length>0&&<div className="card stack" style={{padding:24}}>
      <div className="row-between"><h3>المقاطع ({clips.length})</h3>
        <span className="hint">بانتظار المراجعة {clips.filter(clip=>clip.status==="pending_approval").length} · معتمد {approved.length} · مجدول {clips.filter(clip=>clip.status==="scheduled").length} · منشور {clips.filter(clip=>clip.status==="published").length}</span></div>
      {canReview&&<div className="bulk-bar stack" style={{gap:8}}>
        <label><input type="checkbox" checked={subtitlesChecked} onChange={event=>setSubtitlesChecked(event.currentTarget.checked)}/> شاهدتُ المقاطع وراجعت الترجمة والعنوان قبل الاعتماد</label>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set(reviewable.map(clip=>clip.id)))}>تحديد كل غير المعتمد</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy||!chosen.length||!subtitlesChecked} onClick={()=>void review("approved",chosen)}>اعتماد المحدد ({chosen.length})</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy||!chosen.length} onClick={()=>void review("rejected",chosen)}>رفض المحدد</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy||!chosen.length} onClick={()=>void review("excluded",chosen)}>استبعاد المحدد</button>
        </div></div>}
      <div className="card-grid">{clips.map(clip=><ClipCard key={`${clip.id}:${clip.revision}`} clip={clip} movieId={movieId} busy={busy} canWrite={canWrite} canReview={canReview} subtitlesChecked={subtitlesChecked}
        selected={selected.has(clip.id)} onSelect={on=>setSelected(current=>{const next=new Set(current);if(on)next.add(clip.id);else next.delete(clip.id);return next;})}
        onReview={decision=>void review(decision,[clip])} onSave={body=>act(()=>api(`/api/movies/${movieId}/clips/${clip.id}`,{method:"PATCH",body:{expectedRevision:clip.revision,...body}}),
          body.captions?"حُفظت الترجمة وأُرسل المقطع لإعادة الإخراج؛ يحتاج مراجعة جديدة":"حُفظ التعديل؛ يحتاج المقطع اعتمادًا جديدًا")}/>)}</div>
    </div>}

    {canPublish&&approved.length>0&&<Scheduler pages={pages} defaultPage={movie.page_id} count={approved.length} busy={busy}
      onSubmit={(pageId,start)=>act(()=>api<{scheduled:unknown[]}>(`/api/movies/${movieId}/schedule`,{method:"POST",body:{pageId,start}}),"جُدولت المقاطع المعتمدة بحد 5 ريلز يوميًا بتوقيت الرياض")}/>}

    {publications.length>0&&<div className="card stack" style={{padding:24}}>
      <h3>جدول النشر</h3>
      <div className="responsive-table"><table className="data-table"><thead><tr><th>الجزء</th><th>الصفحة</th><th>الموعد (الرياض)</th><th>الحالة</th><th>الرابط</th>{canPublish&&<th>إجراء</th>}</tr></thead>
        <tbody>{publications.map(pub=><tr key={pub.id}><td>{pub.part_number}</td><td>{pub.page_name??"—"}</td><td>{riyadh(pub.scheduled_at)}</td>
          <td><span className={`badge ${tone(pub.status)}`}>{PUBLICATION_STATUS[pub.status]??pub.status}</span>{pub.error_code&&<small className="cell-error"> {pub.error_code.slice(0,120)}</small>}</td>
          <td>{pub.remote_permalink?<a href={pub.remote_permalink} target="_blank" rel="noreferrer noopener">فتح الريل</a>:pub.remote_reel_id??"—"}</td>
          {canPublish&&<td><PublicationActions pub={pub} busy={busy} onAction={body=>act(()=>api(`/api/movies/${movieId}/publications/${pub.id}`,{method:"POST",body}),"حُدّثت حالة الريل")}/></td>}</tr>)}</tbody></table></div>
    </div>}
  </section>;
}

function RightsReview({movie,busy,onSubmit}:{movie:Detail["movie"];busy:boolean;onSubmit:(body:unknown)=>void}){
  const [note,setNote]=useState("");const [checked,setChecked]=useState(false);
  const decisions=movie.rights_status==="verified"?[["revoked","إلغاء التوثيق"]]:movie.rights_status==="pending"?[["verified","توثيق الحقوق"],["rejected","رفض"]]:[];
  if(!decisions.length)return null;
  return <div className="card stack" style={{padding:24}}><h3>مراجعة الحقوق</h3>
    <label>ملاحظة المراجعة (10 أحرف على الأقل)<textarea rows={2} value={note} maxLength={2000} onChange={event=>setNote(event.currentTarget.value)}/></label>
    <label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.currentTarget.checked)}/> فحصتُ دليل الترخيص ونطاق النشر على Facebook والمقتطفات</label>
    <div className="row-actions">{decisions.map(([decision,label])=><button key={decision} type="button" className={decision==="verified"?"btn btn-primary btn-sm":"btn btn-danger btn-sm"} disabled={busy||!checked||note.trim().length<10}
      onClick={()=>onSubmit({decision,expectedRevision:movie.rights_revision,note,evidenceReviewed:true})}>{label}</button>)}</div></div>;
}

function ResumeUpload({movieId,hidden,onDone}:{movieId:string;hidden:boolean;onDone:()=>void}){
  const [session,setSession]=useState<{id:string;file_name:string;status:string}|null>(null);
  useEffect(()=>{let live=true;void api<{session:typeof session}>(`/api/movies/${movieId}/upload`).then(data=>{if(live)setSession(data.session);}).catch(()=>undefined);return()=>{live=false;};},[movieId,hidden]);
  if(hidden||!session)return null;
  return <p className="banner">يوجد رفع غير مكتمل للملف «{session.file_name}».{session.status==="uploading"&&<> <button type="button" className="link-button" onClick={()=>void api(`/api/movies/${movieId}/upload/${session.id}`,{method:"POST",body:{action:"abort"}}).then(()=>{setSession(null);onDone();})}>إلغاؤه للبدء من جديد</button></>}</p>;
}

function ClipCard({clip,movieId,busy,canWrite,canReview,subtitlesChecked,selected,onSelect,onReview,onSave}:{clip:Clip;movieId:string;busy:boolean;canWrite:boolean;canReview:boolean;subtitlesChecked:boolean;selected:boolean;
  onSelect:(on:boolean)=>void;onReview:(decision:"approved"|"rejected"|"excluded")=>void;onSave:(body:{title?:string;description?:string;captions?:Cue[]})=>void}){
  const [editing,setEditing]=useState(false);
  const [title,setTitle]=useState(clip.title);const [description,setDescription]=useState(clip.description);
  const [captions,setCaptions]=useState(formatCaptions(clip.captions??[]));const [problem,setProblem]=useState("");
  const editable=canWrite&&["pending_approval","approved","rejected","render_failed"].includes(clip.status);
  function save(){
    try {
      const cues=parseCaptions(captions);
      const changedCaptions=JSON.stringify(cues)!==JSON.stringify(clip.captions??[]);
      setProblem("");
      onSave({...(title!==clip.title?{title}:{}),...(description!==clip.description?{description}:{}),...(changedCaptions?{captions:cues}:{})});
      setEditing(false);
    } catch(cause){setProblem(cause instanceof Error?cause.message:"صيغة الترجمة غير صحيحة");}
  }
  return <article className="panel-card stack" data-movie={movieId}>
    <div className="row-between">
      <label>{canReview&&<input type="checkbox" checked={selected} onChange={event=>onSelect(event.currentTarget.checked)}/>} <strong>الجزء {clip.part_number}</strong></label>
      <span className={`badge ${tone(clip.status)}`}>{CLIP_STATUS[clip.status]??clip.status}</span></div>
    {clip.previewUrl&&!["processing","rendering"].includes(clip.status)?<video src={clip.previewUrl} controls preload="metadata" playsInline style={{width:"100%",maxHeight:420,aspectRatio:"9/16",background:"#000",borderRadius:8}}/>:<p className="hint">المعاينة غير متاحة بعد</p>}
    <small className="hint">من الدقيقة {Math.floor(clip.start_ms/60000)}:{String(Math.floor(clip.start_ms/1000)%60).padStart(2,"0")} · نسخة {clip.revision}{clip.scheduled_at?` · ${riyadh(clip.scheduled_at)}`:""}</small>
    {editing?<div className="stack">
      <label>العنوان<input value={title} maxLength={200} onChange={event=>setTitle(event.currentTarget.value)}/></label>
      <label>الوصف<textarea rows={2} value={description} maxLength={2000} onChange={event=>setDescription(event.currentTarget.value)}/></label>
      <label>الترجمة — سطر لكل جملة: «البداية-النهاية النص» بالثواني داخل 0–30<textarea dir="auto" rows={6} value={captions} onChange={event=>setCaptions(event.currentTarget.value)}/></label>
      {problem&&<p className="banner" role="alert">{problem}</p>}
      <div className="row-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>حفظ</button><button type="button" className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}>إلغاء</button></div>
    </div>:<>
      <p><strong>{clip.title}</strong>{clip.description&&<><br/><small>{clip.description}</small></>}</p>
      <details><summary>الترجمة ({clip.captions?.length??0} سطر)</summary><p dir="auto" style={{whiteSpace:"pre-wrap"}}>{(clip.captions??[]).map(cue=>cue.text).join("\n")||"لا توجد ترجمة مكتشفة"}</p></details>
      {clip.remote_permalink&&<a href={clip.remote_permalink} target="_blank" rel="noreferrer noopener">فتح الريل المنشور</a>}
      <div className="row-actions">
        {editable&&<button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={()=>setEditing(true)}>تعديل</button>}
        {canReview&&["pending_approval","rejected","excluded"].includes(clip.status)&&<button type="button" className="btn btn-primary btn-sm" disabled={busy||!subtitlesChecked} title={subtitlesChecked?"":"أكد مراجعة الترجمة أولًا"} onClick={()=>onReview("approved")}>اعتماد</button>}
        {canReview&&["pending_approval","approved","scheduled"].includes(clip.status)&&<button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>onReview("rejected")}>رفض</button>}
        {canReview&&["pending_approval","approved","scheduled","rejected"].includes(clip.status)&&<button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>onReview("excluded")}>استبعاد</button>}
      </div></>}
  </article>;
}

function Scheduler({pages,defaultPage,count,busy,onSubmit}:{pages:Page[];defaultPage:string|null;count:number;busy:boolean;onSubmit:(pageId:string,start:string)=>void}){
  const [page,setPage]=useState(defaultPage&&pages.some(item=>item.id===defaultPage)?defaultPage:"");
  const [start,setStart]=useState(()=>riyadhInput(new Date(Date.now()+3600_000)));
  const days=Math.ceil(count/5);
  return <div className="card stack" style={{padding:24}}><h3>جدولة المقاطع المعتمدة ({count})</h3>
    <p className="hint">تُنشر الأجزاء بالترتيب، بحد أقصى 5 ريلز يوميًا للصفحة (فاصل 4 ساعات و48 دقيقة) بتوقيت الرياض. المدة المتوقعة: نحو {days} يوم. يُعاد التحقق من الحقوق والاعتماد قبل كل نشر.</p>
    <label>صفحة Facebook (إلزامي)<select value={page} onChange={event=>setPage(event.currentTarget.value)} required><option value="" disabled>اختر الصفحة</option>{pages.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>بداية النشر (توقيت الرياض)<input type="datetime-local" value={start} onChange={event=>setStart(event.currentTarget.value)}/></label>
    <button type="button" className="btn btn-primary" disabled={busy||!page||!start} onClick={()=>onSubmit(page,new Date(`${start}:00+03:00`).toISOString())}>حجز مواعيد النشر</button></div>;
}

function PublicationActions({pub,busy,onAction}:{pub:Publication;busy:boolean;onAction:(body:unknown)=>void}){
  const [checked,setChecked]=useState(false);const [reelId,setReelId]=useState("");
  if(pub.status==="scheduled")return <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>onAction({action:"cancel",checkedPage:true})}>إلغاء</button>;
  if(!["failed","outcome_unknown"].includes(pub.status))return null;
  return <div className="stack" style={{gap:4}}>
    <label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.currentTarget.checked)}/> تحققت من صفحة Facebook بخصوص هذا الجزء</label>
    <div className="row-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={busy||!checked} onClick={()=>onAction({action:"retry",checkedPage:true})}>إعادة المحاولة</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy||!checked} onClick={()=>onAction({action:"cancel",checkedPage:true})}>إلغاء</button></div>
    <div className="row-actions"><input placeholder="معرّف الريل إن كان نُشر" value={reelId} inputMode="numeric" onChange={event=>setReelId(event.currentTarget.value.trim())} style={{maxWidth:180}}/>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy||!/^\d{5,30}$/.test(reelId)} onClick={()=>onAction({action:"mark_published",checkedPage:true,remoteReelId:reelId})}>تسجيل كمنشور</button></div>
  </div>;
}

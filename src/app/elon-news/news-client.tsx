'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './news.module.css';
import {Events,TechnicalDetails,type NewsEvent} from './activity';

type Config={monitoring:boolean;autoPublish:boolean;pageId:string|null;sourceIds:string[];pollMinutes:number;dailyLimit:number;minIntervalMinutes:number};
type Row={id:string;title:string;status:string;publication_status:string|null;breaking:boolean;duplicate_of:string|null;created_at:string;error_code:string|null;facebook_post_id:string|null};
type Event=NewsEvent;
type Data={items:Row[];total:number;page:number;counts:Array<{status:string;count:number}>;config:Config;sources:Array<{id:string;name:string;url:string}>;pages:Array<{id:string;name:string}>;activity:Event[];scheduler:{lastRunAt:string|null;lastPollAt:string|null;tickMinutes:number}};
type Detail={story:{id:string;title:string;status:string;arabicPost:string|null;duplicateOf:string|null;breaking:boolean;verification:unknown};reports:Array<{id:string;sourceId:string;title:string;url:string;excerpt:string;sha256:string;fetchedAt:string}>;publications:Array<{id:string;status:string;attempts:number;facebookPostId:string|null;publishedAt:string|null;errorCode:string|null}>;events:Event[]};
const labels:Record<string,string>={all:'كل الأخبار',pending_verification:'بانتظار التحقق',verified:'تم التحقق وفق السياسة',rejected:'مرفوض',queued:'في طابور النشر',preflight:'فحص الصلاحيات',publishing:'جارٍ النشر',published:'منشور تلقائيًا',failed:'تعثر النشر',uncertain:'نتيجة مجهولة — مراجعة مطلوبة'};
const time=(value:string|null)=>value?new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'لم يعمل بعد';
async function api(url:string,init?:RequestInit){const r=await fetch(url,{...init,headers:{'Content-Type':'application/json',...init?.headers}});const d=await r.json();if(!r.ok)throw new Error(d.error??'تعذر تحميل البيانات');return d;}

export function ElonNewsClient(){
 const [data,setData]=useState<Data|null>(null),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [q,setQ]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[source,setSource]=useState(''),[sort,setSort]=useState('newest'),[page,setPage]=useState(1);
 const [detail,setDetail]=useState<Detail|null>(null),[draft,setDraft]=useState(''),[note,setNote]=useState(''),[distinct,setDistinct]=useState(false),[breaking,setBreaking]=useState(false),[postId,setPostId]=useState('');
 const detailRef=useRef<HTMLElement|null>(null),detailId=detail?.story.id;
 useEffect(()=>{if(detailId){detailRef.current?.scrollIntoView({block:'start'});detailRef.current?.focus({preventScroll:true});}},[detailId]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const value=await api('/api/elon-news?'+new URLSearchParams({q:search,status,source,sort,page:String(page)}),{signal});
  setData(value);setConfig(c=>c??value.config);
 },[search,status,source,sort,page]);
 const queryUrl='/api/elon-news?'+new URLSearchParams({q:search,status,source,sort,page:String(page)});
 useEffect(()=>{const controller=new AbortController();api(queryUrl,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setData(value);setConfig(c=>c??value.config);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[queryUrl]);
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'تعذرت العملية');}finally{setBusy(false);}}
 async function open(id:string){await perform(async()=>{const d=await api('/api/elon-news?id='+id);setDetail(d);setDraft(d.story.arabicPost?.split('\n\nالمصدر:')[0]??'');setNote('');setPostId('');setDistinct(false);setBreaking(d.story.breaking);});}
 async function review(action:string){if(!detail)return;await perform(async()=>{
  const d=await api('/api/elon-news',{method:'POST',body:JSON.stringify({id:detail.story.id,action,note,arabicPost:draft||undefined,distinctConfirmed:distinct,breaking,facebookPostId:postId||undefined})});
  if(action==='compose'){setDraft(d.post.split('\n\nالمصدر:')[0]);setNotice('راجع الصياغة قبل الاعتماد.');}else{setNotice('تم تسجيل الإجراء.');setDetail(await api('/api/elon-news?id='+detail.story.id));await refresh();}
 });}
 return <div className={styles.root}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data&&!error&&<p role="status">جارٍ تحميل الأخبار…</p>}
  {data&&config&&<>
   <section className={`card ${styles.settings}`} aria-labelledby="elon-settings"><h2 id="elon-settings">إعدادات الأتمتة</h2>
    <form onSubmit={e=>{e.preventDefault();perform(async()=>{const {monitoring,autoPublish,pageId,sourceIds,pollMinutes,dailyLimit,minIntervalMinutes}=config;
     const saved=await api('/api/elon-news',{method:'PUT',body:JSON.stringify({monitoring,autoPublish,pageId,sourceIds,pollMinutes,dailyLimit,minIntervalMinutes})});setConfig(saved.config);setNotice('حُفظت الإعدادات.');await refresh();});}}>
     <div className={styles.grid}>
      <label className={styles.check}><input type="checkbox" checked={config.monitoring} onChange={e=>setConfig({...config,monitoring:e.target.checked,autoPublish:e.target.checked?config.autoPublish:false})}/>تفعيل متابعة الأخبار</label>
      <label className={styles.check}><input type="checkbox" checked={config.autoPublish} onChange={e=>setConfig({...config,autoPublish:e.target.checked})}/>تفعيل النشر العام التلقائي بعد التحقق</label>
      <label>صفحة Facebook<select value={config.pageId??''} onChange={e=>setConfig({...config,pageId:e.target.value||null})}><option value="">اختر الصفحة</option>{data.pages.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>فحص الأخبار كل (دقيقة)<input required type="number" min="10" max="1440" value={config.pollMinutes} onChange={e=>setConfig({...config,pollMinutes:Number(e.target.value)})}/></label>
      <label>الحد اليومي (بتوقيت الرياض)<input required type="number" min="1" max="30" value={config.dailyLimit} onChange={e=>setConfig({...config,dailyLimit:Number(e.target.value)})}/></label>
      <label>أقل فاصل بين منشورين (دقيقة)<input required type="number" min="10" max="1440" value={config.minIntervalMinutes} onChange={e=>setConfig({...config,minIntervalMinutes:Number(e.target.value)})}/></label>
     </div>
     <fieldset><legend>المصادر المعتمدة — فعّل المصادر التي توافق عليها</legend><div className={styles.grid}>{data.sources.map(s=><label key={s.id} className={styles.check}><input type="checkbox" checked={config.sourceIds.includes(s.id)} onChange={e=>setConfig({...config,sourceIds:e.target.checked?[...config.sourceIds,s.id]:config.sourceIds.filter(id=>id!==s.id)})}/>{s.name}</label>)}</div></fieldset>
     <p>التحقق الآلي محافظ: تقريران بعنوان متطابق من مصدرين معتمدين؛ الأخبار المتشابهة والشائعات تبقى للمراجعة. الأولوية للعاجل الذي يحدده المسؤول، دون تجاوز الحصة أو الفاصل.</p>
     <p>المجدول الحالي كل {data.scheduler.tickMinutes} دقائق؛ الإعداد يحدد أقل فترة فحص ولا يضمن التنفيذ في الدقيقة نفسها. لا نستخدم Cron متكررًا غير متوافق مع خطة Vercel.</p>
     <button className="btn primary" disabled={busy}>حفظ الإعدادات</button>
    </form><small>آخر تشغيل: {time(data.scheduler.lastRunAt)} · آخر فحص: {time(data.scheduler.lastPollAt)}</small>
   </section>
   <section className={styles.stats} aria-label="حالات الأخبار">{data.counts.map(c=><button key={c.status} className="card" onClick={()=>{setStatus(c.status==='preflight'?'queued':c.status);setPage(1);}}><strong>{c.count}</strong><span>{labels[c.status]??c.status}</span></button>)}</section>
   <section className="card" aria-labelledby="elon-latest"><h2 id="elon-latest">الأخبار المكتشفة وسجل النشر</h2>
    <form className={styles.filters} onSubmit={e=>{e.preventDefault();setSearch(q);setPage(1);}}>
     <label>بحث<input value={q} onChange={e=>setQ(e.target.value)} placeholder="عنوان الخبر"/></label><button className="btn" disabled={busy}>بحث</button>
     <label>الحالة<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{Object.entries(labels).filter(([k])=>k!=='preflight').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <label>المصدر<select value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}><option value="">كل المصادر</option>{data.sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>الترتيب<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="newest">الأحدث</option><option value="oldest">الأقدم</option><option value="priority">الأولوية للعاجل</option></select></label>
    </form>
    {data.items.length===0?<p>لا توجد أخبار مطابقة. فعّل المتابعة وحدد المصادر، ثم انتظر تشغيل المجدول.</p>:<ul className={styles.list}>{data.items.map(item=><li key={item.id}>
     <div><button className={styles.title} disabled={busy} onClick={()=>open(item.id)}>{item.title}</button><p>{item.breaking?'عاجل · ':''}{labels[item.status==='rejected'?'rejected':item.publication_status??item.status]??item.status}{item.duplicate_of?' · احتمال تكرار':''}</p><small>{time(item.created_at)}</small>{item.error_code&&<code dir="ltr">{item.error_code}</code>}</div>
     {item.facebook_post_id&&<a href={'https://www.facebook.com/'+item.facebook_post_id} target="_blank" rel="noopener noreferrer">عرض المنشور</a>}
    </li>)}</ul>}
    <nav aria-label="صفحات الأخبار" className={styles.actions}><button className="btn" disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}>السابق</button><span>صفحة {page} · {data.total} خبر</span><button className="btn" disabled={page*20>=data.total||busy} onClick={()=>setPage(p=>p+1)}>التالي</button><button className="btn" disabled={busy} onClick={()=>perform(()=>refresh())}>تحديث</button></nav>
   </section>
   {detail&&<section ref={detailRef} tabIndex={-1} className={`card ${styles.detail}`} aria-labelledby="elon-detail"><div className={styles.actions}><h2 id="elon-detail">{detail.story.title}</h2><button className="btn" onClick={()=>setDetail(null)}>إغلاق التفاصيل</button></div>
    <h3>أدلة التحقق</h3><p>{labels[detail.story.status]??'راجع تقارير المصادر وملاحظات المراجعة أدناه.'}</p><TechnicalDetails value={detail.story.verification} className={styles.technical}/>
    {detail.reports.map(r=><article key={r.id}><h4>{data.sources.find(s=>s.id===r.sourceId)?.name??r.sourceId}</h4><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a><p>{r.excerpt}</p><small>جُلب: {time(r.fetchedAt)}</small><code dir="ltr">SHA-256: {r.sha256}</code></article>)}
    <label>صياغة المنشور العربية (قبل إضافة رابط المصدر)<textarea rows={5} value={draft} onChange={e=>setDraft(e.target.value)}/></label>
    <label>أدلة وملاحظات المراجعة<textarea rows={3} minLength={10} value={note} onChange={e=>setNote(e.target.value)} placeholder="ما الذي تحققت منه؟ وأين الدليل؟"/></label>
    {detail.story.duplicateOf&&<label className={styles.check}><input type="checkbox" checked={distinct} onChange={e=>setDistinct(e.target.checked)}/>راجعت الخبر السابق، وهذا حدث مختلف فعلًا</label>}
    <label className={styles.check}><input type="checkbox" checked={breaking} onChange={e=>setBreaking(e.target.checked)}/>خبر عاجل — أولوية داخل الحدود المحددة</label>
    <div className={styles.actions}><button className="btn" disabled={busy||note.trim().length<10} onClick={()=>review('compose')}>اقتراح ترجمة عربية</button><button className="btn primary" disabled={busy||note.trim().length<10||!draft} onClick={()=>review('verify')}>اعتماد الخبر والصياغة</button><button className="btn" disabled={busy||note.trim().length<10} onClick={()=>review('reject')}>رفض الخبر</button></div>
    <h3>تاريخ النشر</h3>{detail.publications.length===0&&<p>لم يدخل طابور النشر بعد.</p>}{detail.publications.map(p=><article key={p.id}><p>{labels[p.status]??p.status} · {p.attempts} محاولة · {time(p.publishedAt)}</p><code>{p.errorCode}</code>{p.facebookPostId&&<a href={'https://www.facebook.com/'+p.facebookPostId} target="_blank" rel="noopener noreferrer">{p.facebookPostId}</a>}
     {p.status==='failed'&&<button className="btn" disabled={busy||note.trim().length<10||p.attempts>=5} onClick={()=>review('retry')}>إعادة محاولة آمنة بعد فحص الصلاحيات</button>}
     {p.status==='uncertain'&&<><p>لا تعِد نشره. افحص الصفحة ثم أدخل معرّف المنشور الموجود للتحقق منه.</p><label>معرّف منشور Facebook<input dir="ltr" value={postId} onChange={e=>setPostId(e.target.value)} placeholder="pageId_postId"/></label><button className="btn" disabled={busy||!postId||note.trim().length<10} onClick={()=>review('reconcile')}>التحقق من المنشور الموجود وربطه</button></>}
    </article>)}
    <h3>سجل الخبر</h3><Events events={detail.events} formatTime={time} classes={styles}/>
   </section>}
   <section className="card"><h2>سجل نشاط الأتمتة</h2><Events events={data.activity} formatTime={time} classes={styles}/></section>
  </>}
 </div>;
}

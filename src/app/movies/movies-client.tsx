"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, riyadh } from "../ui/api";
import { MovieDetail } from "./movie-detail";

type Movie = {id:string;title:string;status:string;rightsStatus:string;createdAt?:string};
type Page = {id:string;name:string};
const states: Record<string,string> = {draft:"لم يُرفع الملف بعد",uploaded:"تم الرفع",queued:"في طابور المعالجة",processing:"جارٍ المعالجة",review_required:"بانتظار مراجعة المقاطع",ready:"جاهز",failed:"تعذرت المعالجة",deleting:"حذف غير مكتمل — أعد المحاولة"};
const rightsLabels: Record<string,string> = {pending:"بانتظار التحقق",verified:"حقوق موثقة",rejected:"حقوق مرفوضة",revoked:"ترخيص ملغى"};

export function MoviesClient({enabled,canWrite,canReview=false,canPublish=false,canDelete=false,pages}:{enabled:boolean;canWrite:boolean;canReview?:boolean;canPublish?:boolean;canDelete?:boolean;pages:Page[]}) {
  const [openId,setOpenId]=useState<string|null>(null);
  const [items,setItems]=useState<Movie[]>([]);
  const [loading,setLoading]=useState(enabled);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [pendingDelete,setPendingDelete]=useState<Movie|null>(null);
  const [deleteConfirmation,setDeleteConfirmation]=useState("");
  const [deleteError,setDeleteError]=useState("");
  const [deleting,setDeleting]=useState(false);
  const saving=useRef(false);
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const request=++sequence.current;
    try {const data=await api<{items:Movie[]}>("/api/movies");if(request===sequence.current)setItems(data.items);}
    catch(cause){if(request===sequence.current)setError(cause instanceof Error?cause.message:"تعذر تحميل الأفلام");}
    finally{if(request===sequence.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    const requests=sequence;
    const request=++requests.current;
    void api<{items:Movie[]}>("/api/movies")
      .then(data=>{if(request===requests.current)setItems(data.items);})
      .catch(cause=>{if(request===requests.current)setError(cause instanceof Error?cause.message:"تعذر تحميل الأفلام");})
      .finally(()=>{if(request===requests.current)setLoading(false);});
    return()=>{++requests.current;};
  },[enabled]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current)return;
    const form=event.currentTarget;
    const fields=new FormData(form);
    saving.current=true;setBusy(true);setError("");setNotice("");
    try {
      const expiry=String(fields.get("expiry")??"");
      const movie=await api<Movie>("/api/movies",{method:"POST",body:{title:fields.get("title"),pageId:fields.get("page"),rightsBasis:fields.get("basis"),rightsEvidence:fields.get("evidence"),rightsExpiresAt:expiry?new Date(`${expiry}T23:59:59+03:00`).toISOString():null,facebookAllowed:fields.get("facebook")==="on",excerptsAllowed:fields.get("excerpts")==="on",declaration:fields.get("declaration")==="on"}});
      ++sequence.current;setLoading(false);setItems(current=>[movie,...current]);
      form.reset();setOpenId(movie.id);setNotice("حُفظ سجل الفيلم بانتظار التحقق من الحقوق. ارفع ملف الفيديو من بطاقة الفيلم أدناه.");
    } catch(cause){setError(cause instanceof Error?cause.message:"تعذر تسجيل الفيلم");}
    finally{saving.current=false;setBusy(false);}
  }
  async function deleteSelectedMovie(){
    const movie=pendingDelete;
    if(!movie||deleteConfirmation!==movie.title||deleting)return;
    setDeleting(true);setDeleteError("");setError("");
    try {
      const result=await api<{deleted:boolean;objectsDeleted:number}>(`/api/movies/${movie.id}/delete`,{
        method:"POST",body:{confirmation:movie.title}
      });
      if(!result.deleted)throw new Error("لم يكتمل حذف الفيلم");
      ++sequence.current;
      setOpenId(current=>current===movie.id?null:current);
      setItems(current=>current.filter(item=>item.id!==movie.id));
      setPendingDelete(null);
      setDeleteConfirmation("");
      setNotice(`حُذف الفيلم «${movie.title}» وملفاته نهائيًا من التخزين وقاعدة البيانات.`);
      void load();
    } catch(cause) {
      setDeleteError(cause instanceof Error?cause.message:"تعذر الحذف؛ أعد المحاولة لاحقًا");
    } finally {setDeleting(false);}
  }
  return <div className="stack">
    <section className="card" style={{padding:24}}>
      <h2>رحلة الفيلم</h2>
      <p>تسجيل الترخيص ← رفع خاص ← معالجة وترجمة ← مراجعة واعتماد ← جدولة بتوقيت الرياض</p>
      {enabled?<p className="banner">لا يُنشر أي مقطع دون توثيق الحقوق واعتماد نسخته النهائية واختيار صفحة Facebook. النشر التلقائي يعمل فقط بعد تفعيله صراحة.</p>
        :<p className="banner">رفع الفيديو والمعالجة السحابية والنشر غير مفعّلة بعد. لا يُنشر أي مقطع دون تحقق الحقوق ومراجعة نسخته النهائية.</p>}
    </section>
    {!enabled&&<p className="banner" role="status">القسم في مرحلة التجهيز. التسجيل متاح بعد تطبيق ترحيل قاعدة البيانات وتفعيل القسم؛ تفعيل النشر منفصل ويحتاج موافقتك النهائية.</p>}
    {notice&&<p className="banner" role="status">{notice}</p>}
    {error&&<p className="banner" role="alert">{error}</p>}
    {canWrite&&<form className="card stack" style={{padding:24}} onSubmit={submit}>
      <h2>تسجيل فيلم مرخّص</h2>
      <fieldset disabled={!enabled||busy} className="stack" style={{border:0,padding:0}}>
        <label>عنوان الفيلم<input name="title" required maxLength={160}/></label>
        <label>صفحة Facebook المستهدفة<select name="page" required defaultValue=""><option value="" disabled>اختر الصفحة</option>{pages.map(page=><option value={page.id} key={page.id}>{page.name}</option>)}</select></label>
        <label>أساس الحقوق<select name="basis" defaultValue="owned"><option value="owned">أملك حقوق الفيديو</option><option value="licensed">ترخيص من صاحب الحقوق</option><option value="public_domain">ملكية عامة موثقة</option></select></label>
        <label>تفاصيل الترخيص ودليل الحقوق<textarea name="evidence" required minLength={10} maxLength={4000} rows={4} placeholder="اذكر صاحب الحقوق ونطاق الإذن ومرجع الترخيص. لا تُدخل كلمات مرور أو مفاتيح سرية."/></label>
        <label>آخر يوم لصلاحية الترخيص — اختياري<input name="expiry" type="date"/></label>
        <label><input name="facebook" type="checkbox" required/>الحقوق تسمح بالنشر على Facebook</label>
        <label><input name="excerpts" type="checkbox" required/>الحقوق تسمح باستخراج مقاطع قصيرة</label>
        <label><input name="declaration" type="checkbox" required/>أقر بصحة بيانات الحقوق؛ هذا الإقرار ليس موافقة نشر</label>
        <button className="btn btn-primary" type="submit" disabled={!pages.length}>{busy?"جارٍ الحفظ…":"حفظ بيانات الفيلم"}</button>
      </fieldset>
    </form>}
    <section className="card stack" style={{padding:24}} aria-busy={loading}>
      <div className="row-between"><h2>الأفلام المسجّلة</h2><button type="button" className="btn btn-secondary" disabled={!enabled||loading||busy} onClick={()=>{setLoading(true);setError("");void load();}}>تحديث</button></div>
      {loading?<p role="status">جارٍ تحميل الأفلام…</p>:!items.length?<p>{enabled?"لا توجد أفلام مسجلة بعد.":"ستظهر أفلامك هنا بعد تجهيز القسم."}</p>:items.map(movie=><article key={movie.id} className="panel-card row-between"><div><h3>{movie.title}</h3><p>{states[movie.status]??movie.status} · {rightsLabels[movie.rightsStatus]??movie.rightsStatus}</p><small>{riyadh(movie.createdAt)}</small></div>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={openId===movie.id} onClick={()=>setOpenId(current=>current===movie.id?null:movie.id)}>{openId===movie.id?"إغلاق":"فتح ومراجعة"}</button>
          {canDelete&&<button type="button" className="btn btn-danger btn-sm" disabled={deleting} onClick={()=>{setPendingDelete(movie);setDeleteConfirmation("");setDeleteError("");}}>حذف</button>}
        </div></article>)}
    </section>
    {enabled&&openId&&<MovieDetail key={openId} movieId={openId} pages={pages} canWrite={canWrite} canReview={canReview} canPublish={canPublish} onChanged={()=>void load()}/>}
    {pendingDelete&&<div>
      <div className="dialog-backdrop" onClick={()=>{if(!deleting)setPendingDelete(null);}}/>
      <div className="dialog stack" role="alertdialog" aria-modal="true" aria-labelledby="movie-delete-title"
        onKeyDown={event=>{if(event.key==="Escape"&&!deleting)setPendingDelete(null);}}>
        <h2 id="movie-delete-title">حذف الفيلم نهائيًا</h2>
        <p>سيتم حذف «{pendingDelete.title}» والفيديو الأصلي وجميع المقاطع والنسخ المحفوظة في R2، ثم سجلات الفيلم المرتبطة في قاعدة البيانات. لا يمكن التراجع عن ذلك.</p>
        <p className="hint">يُرفض الحذف إذا كانت المعالجة جارية أو وُجدت ريلز مجدولة أو منشورة. لن يُحذف أي منشور من Facebook.</p>
        <label>اكتب اسم الفيلم «{pendingDelete.title}» للتأكيد
          <input value={deleteConfirmation} onChange={event=>setDeleteConfirmation(event.currentTarget.value)} autoComplete="off" autoFocus disabled={deleting}/>
        </label>
        {deleteError&&<p className="banner" role="alert">{deleteError}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-danger" disabled={deleting||deleteConfirmation!==pendingDelete.title} onClick={()=>void deleteSelectedMovie()}>
            {deleting?"جارٍ الحذف والتحقق…":"حذف الفيلم نهائيًا"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={deleting} onClick={()=>setPendingDelete(null)}>إلغاء</button>
        </div>
      </div>
    </div>}
  </div>;
}

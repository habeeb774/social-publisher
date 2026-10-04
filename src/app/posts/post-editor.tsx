"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { isoToRiyadhInput, riyadhInputToIso } from "@/services/post-time";
import { AppShell } from "../ui/app-shell";

export type EditorPost={id:string;pageId:string;content:string;scheduledAt:string|null;updatedAt:string;status:string};
export default function PostEditor({initial,pages,publishingEnabled}:{initial?:EditorPost;pages:Array<{id:string;name:string}>;publishingEnabled:boolean}) {
  const router=useRouter();
  const [body,setBody]=useState(initial?.content||"");
  const [date,setDate]=useState(isoToRiyadhInput(initial?.scheduledAt||null));
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const busy=useRef(false);
  const editable=!initial||["draft","scheduled"].includes(initial.status);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy.current)return;
    const form=new FormData(event.currentTarget);
    const intent=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="scheduled"?"scheduled":"draft";
    setError("");
    busy.current=true;setSaving(true);
    try {
      const scheduledAt=intent==="scheduled"?riyadhInputToIso(date):undefined;
      if(scheduledAt&&new Date(scheduledAt).getTime()<=Date.now())throw new Error("حدد موعدًا في المستقبل بتوقيت الرياض");
      const response=await fetch(initial?`/api/posts/${initial.id}`:"/api/posts",{method:initial?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pageId:initial?.pageId||String(form.get("page")),content:body,scheduledAt,timezone:"Asia/Riyadh",status:intent,updatedAt:initial?.updatedAt})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"تعذر الحفظ");
      router.push(`/posts/${result.id}`);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذر الاتصال. تحقق من قائمة المنشورات قبل إعادة المحاولة.");}
    finally{busy.current=false;setSaving(false);}
  }
  return <AppShell title={initial?"تحرير المنشور":"إنشاء منشور"}>
    <div className="detail-top"><h1>{initial?"تحرير المحتوى":"إنشاء منشور"}</h1><Link href="/posts" className="secondary-button">العودة للمنشورات</Link></div>
    <div className="form-layout composer-layout"><section className="panel-card form-card"><p className="banner">{publishingEnabled?"النشر الحقيقي مفعّل. المنشور المجدول قابل للنشر عند تشغيل العامل بعد موعده.":"وضع الاختبار مفعّل. لن يُنشر المحتوى فعليًا."}</p>
      {!editable&&<p role="alert">لا يمكن تعديل منشور بدأ تنفيذه أو انتهى. راجع سجل المحاولات.</p>}
      {error&&<p className="banner" role="alert">{error}</p>}
      <form className="post-form" onSubmit={submit}><fieldset disabled={saving||!editable||!pages.length} style={{border:0,padding:0,minWidth:0}}>
        <label htmlFor="editor-page">الصفحة<select id="editor-page" name="page" defaultValue={initial?.pageId||pages[0]?.id} disabled={Boolean(initial)}>{pages.map(page=><option key={page.id} value={page.id}>{page.name}</option>)}</select></label>
        <label htmlFor="editor-content">نص المنشور<textarea id="editor-content" required maxLength={63206} rows={8} value={body} onChange={event=>setBody(event.target.value)}/><small>{body.length} / 63206 حرفًا</small></label>
        <label htmlFor="editor-date">موعد النشر · توقيت الرياض (UTC+3)<input id="editor-date" type="datetime-local" value={date} onChange={event=>setDate(event.target.value)}/></label>
        <div className="form-actions"><button className="secondary-button" type="submit" value="draft">{saving?"جارٍ الحفظ…":"حفظ كمسودة"}</button><button className="primary-button" type="submit" value="scheduled">حفظ وجدولة</button></div>
      </fieldset></form>{!pages.length&&<p>لا توجد صفحة نشطة متاحة. راجع التكاملات.</p>}
    </section><aside className="panel-card preview-card"><h2>معاينة النص</h2><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{body||"ستظهر معاينة النص هنا"}</p></aside></div>
  </AppShell>;
}

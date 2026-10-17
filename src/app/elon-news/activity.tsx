import React from 'react';

export type NewsEvent={id:string;code:string;createdAt:string;details:unknown};
const messages:Record<string,string>={
 REPORT_DISCOVERED:'تم العثور على تقرير إخباري جديد.',
 SOURCE_FETCH_FAILED:'تعذر جلب الأخبار من المصدر؛ راجع الاتصال بالمصدر.',
 POSSIBLE_DUPLICATE_HELD:'أُوقف الخبر للمراجعة لاحتمال نشر الحدث نفسه سابقًا.',
 POLICY_VERIFIED:'استوفى الخبر سياسة مطابقة التقارير من مصادر مستقلة؛ وليس ذلك ضمانًا لصحة الخبر.',
 ARABIC_GENERATION_FAILED:'تعذرت صياغة الخبر بالعربية؛ يحتاج إلى مراجعة.',
 PUBLISHED:'تم نشر الخبر على فيسبوك بنجاح.',
 DISCOVERY_COMPLETED:'اكتمل فحص المصادر بحثًا عن أخبار جديدة.',
 MANUALLY_VERIFIED:'اعتمد المسؤول الخبر والصياغة بعد المراجعة.',
 REJECTED:'رُفض الخبر بعد المراجعة.',
 MANUAL_SAFE_RETRY:'سُجل طلب إعادة محاولة النشر الآمنة.',
 RECONCILED:'تم التحقق من المنشور الموجود وربطه بالخبر دون إعادة نشره.',
 PAGE_RECONNECT_REQUIRED:'يلزم إعادة ربط صفحة فيسبوك قبل النشر.',
 PAGE_PERMISSIONS_REQUIRED:'لم تتوفر صلاحيات الصفحة المطلوبة؛ لم يُسمح بالنشر.',
 PAGE_IDENTITY_MISMATCH:'هوية الصفحة لا تطابق الربط المحدد؛ لم يُسمح بالنشر.',
 PAGE_VALIDATION_UNAVAILABLE:'تعذر التحقق من صلاحيات الصفحة؛ سيعاد الفحص بأمان.',
 META_OUTCOME_UNKNOWN:'تعذر تأكيد نتيجة الإرسال؛ يلزم فحص الصفحة ولن يعاد النشر تلقائيًا.',
};
function fields(value:unknown):Record<string,unknown>{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
export function eventMessage(code:string,details:unknown){
 if(code==='CONFIG_UPDATED'){
  const value=fields(details),states:string[]=[];
  if(typeof value.monitoring==='boolean')states.push(value.monitoring?'متابعة الأخبار مفعّلة':'متابعة الأخبار متوقفة');
  if(typeof value.autoPublish==='boolean')states.push(value.autoPublish?'النشر التلقائي مفعّل':'النشر التلقائي متوقف');
  return states.length?'حُفظت الإعدادات: '+states.join('، ')+'.':'حُفظت إعدادات الأتمتة.';
 }
 if(/^META_REJECTED_/.test(code)){
  return fields(details).state==='queued'?'رفضت فيسبوك محاولة النشر مؤقتًا؛ جُدولت إعادة محاولة آمنة.':'رفضت فيسبوك محاولة النشر؛ راجع التفاصيل والربط قبل إعادة المحاولة.';
 }
 return messages[code]??'سُجل تحديث في نشاط الأتمتة؛ تتوفر معلومات إضافية في التفاصيل التقنية.';
}
export function TechnicalDetails({value,code,className}:{value:unknown;code?:string;className?:string}){
 return <details className={className}><summary>عرض التفاصيل التقنية</summary>
  {code&&<code dir="ltr">{code}</code>}<pre dir="ltr">{JSON.stringify(value??{},null,2)}</pre>
 </details>;
}
export function Events({events,formatTime,classes}:{events:NewsEvent[];formatTime:(value:string)=>string;classes:Readonly<Record<string,string>>}){
 return events.length?<ol className={classes.events}>{events.map(event=><li key={event.id}>
  <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
  <p>{eventMessage(event.code,event.details)}</p>
  <TechnicalDetails code={event.code} value={event.details} className={classes.technical}/>
 </li>)}</ol>:<p>لا توجد أحداث بعد.</p>;
}
export function ActivityLog(props:React.ComponentProps<typeof Events>){
 return <details className={`card ${props.classes.activityLog??''}`}>
  <summary className={props.classes.activitySummary}><h2>سجل نشاط الأتمتة <span>({props.events.length})</span></h2></summary>
  <Events {...props}/>
 </details>;
}

'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {activeExperiment,type ReachExperiment} from '@/services/reach-experiment-model';
const date=(value:string)=>new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
export function ReachExperimentPanel({initial,canManage,measurements}:{initial:ReachExperiment|null;canManage:boolean;measurements:{measured:number;below:number;unknown:number;timely:number}}){
 const [experiment,setExperiment]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 const active=activeExperiment(experiment);
 async function start(){setBusy(true);setError('');try{
  const response=await fetch('/api/reach-experiment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start'})});
  const value=await response.json();if(!response.ok)throw new Error(value.error??'تعذر بدء التجربة');setExperiment(value.experiment);router.refresh();
 }catch(e){setError(e instanceof Error?e.message:'تعذر بدء التجربة');}finally{setBusy(false);}}
 return <section className="card"><h2>تجربة تحسين الوصول — 7 أيام</h2>
  <p>رَصْدُوق وم. حبيب: حتى 4 منشورات أخبار عربية يوميًا لكل صفحة، في نوافذ 9 صباحًا و1 ظهرًا و5 مساءً و9 مساءً بتوقيت الرياض. لا تعويض للنوافذ الفائتة.</p>
  <p>مسار أخبار واحد خلال التجربة. تظل المتابعة تعمل، ويتوقف إرسال مسارات الأخبار الأخرى مؤقتًا. الأخبار العادية المستحقة خارج مسار التجربة تُحفظ كمسودات للمراجعة دون حذف. لا تشمل الأذكار والمحتوى غير الإخباري.</p>
  <p>الهدف 1000 مشاهدة خلال 24 ساعة، وليس وعدًا بالوصول. لا إعلانات مدفوعة.</p>
  {experiment&&<p role="status">{active?'التجربة مفعّلة':'التجربة منتهية'} · البداية: {date(experiment.startsAt)} · النهاية: {date(experiment.endsAt)}</p>}
  {experiment&&<p>قياس تلقائي بعد 24 ساعة: {measurements.measured} منشورًا · بلوغ الهدف موثق في المهلة: {measurements.timely} · دون الهدف عند القياس: {measurements.below} · توقيت البلوغ غير موثق أو البيانات ناقصة: {measurements.unknown}. لا تُستبدل البيانات الناقصة بصفر.</p>}
  {canManage&&!active&&<button className="btn primary" disabled={busy} onClick={start}>{busy?'جارٍ التفعيل…':'بدء تجربة 7 أيام'}</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

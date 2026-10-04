import Link from "next/link";
import { and, asc, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
export const dynamic="force-dynamic";
const days=["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const labels:Record<string,string>={draft:"مسودة",scheduled:"مجدول",publishing:"قيد النشر",published:"منشور",failed:"فشل",cancelled:"ملغي",archived:"مؤرشف"};
export default async function Calendar({searchParams}:{searchParams:Promise<{month?:string}>}) {
  const params=await searchParams;
  const db=getDb();
  const todayResult=await db.execute(sql`select to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD') as today`);
  const today=String(todayResult.rows[0].today);
  const month=params.month&&/^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)&&Number(params.month.slice(0,4))>=2000&&Number(params.month.slice(0,4))<=2100?params.month:today.slice(0,7);
  const [year,monthNumber]=month.split("-").map(Number);
  const monthDate=new Date(Date.UTC(year,monthNumber-1,1));
  const adjacent=(offset:number)=>new Date(Date.UTC(year,monthNumber-1+offset,1)).toISOString().slice(0,7);
  const next=adjacent(1);
  const entries=await db.select({id:posts.id,content:posts.content,status:posts.status,scheduledAt:posts.scheduledAt}).from(posts).where(and(isNull(posts.deletedAt),gte(posts.scheduledAt,new Date(`${month}-01T00:00:00+03:00`)),lt(posts.scheduledAt,new Date(`${next}-01T00:00:00+03:00`)))).orderBy(asc(posts.scheduledAt));
  const daysInMonth=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  const offset=monthDate.getUTCDay();
  const cells=Math.ceil((offset+daysInMonth)/7)*7;
  return <AppShell title="التقويم"><div className="calendar-toolbar"><Link className="icon-button" aria-label="الشهر السابق" href={`/calendar?month=${adjacent(-1)}`}>‹</Link><strong>{monthDate.toLocaleDateString("ar-SA-u-ca-gregory",{month:"long",year:"numeric",timeZone:"UTC"})}</strong><Link className="icon-button" aria-label="الشهر التالي" href={`/calendar?month=${next}`}>›</Link><Link href="/calendar">الشهر الحالي</Link><Link className="primary-button" href="/posts/new">جدولة منشور</Link></div>
    <p>المواعيد بتوقيت الرياض. حالة «مسودة» لا تعني أن المنشور سيُنشر تلقائيًا.</p>
    <section className="panel-card calendar-card"><div className="calendar-grid">{days.map(day=><b key={day}>{day}</b>)}{Array.from({length:cells},(_,index)=>{
      const day=index-offset+1;
      if(day<1||day>daysInMonth)return <div className="calendar-day" key={index}/>;
      const date=`${month}-${String(day).padStart(2,"0")}`;
      const items=entries.filter(item=>new Date(item.scheduledAt!.getTime()+3*3600000).toISOString().slice(0,10)===date);
      return <div key={index} className={`calendar-day ${date===today?"today":""}`}><span>{day}</span>{items.map(item=><Link key={item.id} href={`/posts/${item.id}`} style={{display:"block",fontSize:12,overflowWrap:"anywhere"}}>{item.scheduledAt!.toLocaleTimeString("ar-SA",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"})} · {labels[item.status]}<br/>{item.content.slice(0,50)}</Link>)}</div>;
    })}</div></section>{!entries.length&&<p className="panel-card">لا توجد منشورات لها موعد في هذا الشهر.</p>}
  </AppShell>;
}

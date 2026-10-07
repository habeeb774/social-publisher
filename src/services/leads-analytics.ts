import { sql } from "drizzle-orm";
import { z } from "zod";
import { leadPageScope } from "./leads-access";
const DAY=86400000;
export function leadAnalyticsRange(params:{days?:string;from?:string;to?:string},now=new Date()) {
  const today=new Date(now.getTime()+3*3600000).toISOString().slice(0,10);
  const parse=(value:string)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)throw new Error("INVALID_RANGE");
    return new Date(`${value}T00:00:00+03:00`);
  };
  const days=["7","30","90"].includes(params.days??"")?Number(params.days):30;
  const from=params.from??new Date(parse(today).getTime()-(days-1)*DAY+3*3600000).toISOString().slice(0,10);
  const to=params.to??today;
  const start=parse(from),end=new Date(parse(to).getTime()+DAY);
  if(start>=end||end.getTime()-start.getTime()>366*DAY)throw new Error("INVALID_RANGE");
  return {from,to,start:start.toISOString(),end:end.toISOString()};
}
export type LeadAnalyticsRow={source:string;total:number;won:number;lost:number};
export const leadAnalyticsFilters=z.object({platform:z.enum(['all','facebook','instagram']).default('all'),pageId:z.union([z.uuid(),z.literal('')]).default('')});
type Filters=z.infer<typeof leadAnalyticsFilters>;
export function leadAnalyticsPagesQuery(allowed:ReadonlySet<string>|null,search='') {
  const like=`%${search.trim().slice(0,100).replace(/[\\%_]/g,value=>`\\${value}`)}%`;
  return sql`select p.id,p.name,p.platform from facebook_pages p where ${leadPageScope(allowed,'p.id')}
    and p.name ilike ${like} order by p.name,p.id limit 201`;
}
export function leadAnalyticsQuery(range:ReturnType<typeof leadAnalyticsRange>,allowed:ReadonlySet<string>|null,filters:Filters={platform:'all',pageId:''}) {
  return sql`select case when l.source in ('manual','messenger') then l.source else 'other' end as source,
    count(*)::int as total,count(*) filter(where l.status='won')::int as won,count(*) filter(where l.status='lost')::int as lost
    from leads l left join facebook_pages p on p.id=l.page_id where ${leadPageScope(allowed,'l.page_id')}
    and ${filters.pageId?sql`l.page_id=${filters.pageId}::uuid`:sql`true`}
    and ${filters.platform==='all'?sql`true`:sql`p.platform=${filters.platform}`}
    and l.created_at>=${range.start}::timestamptz and l.created_at<${range.end}::timestamptz
    group by 1 order by 1`;
}
export function leadAnalyticsSummary(rows:LeadAnalyticsRow[]) {
  const totals=rows.reduce((a,row)=>({total:a.total+row.total,won:a.won+row.won,lost:a.lost+row.lost}),{total:0,won:0,lost:0});
  return {...totals,conversion:totals.total?Math.round(totals.won/totals.total*1000)/10:null};
}

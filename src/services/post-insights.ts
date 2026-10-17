import {storedPageToken} from './page-tokens';
import {isGraphConfigured} from './facebook-graph';

const base=()=>`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v23.0'}`;
export const PERFORMANCE_METRICS:Record<string,string>={
 post_media_view:'المشاهدات',
 post_total_media_view_unique:'المشاهدون الفريدون',
 post_clicks:'النقرات',
 post_reactions_by_type_total:'التفاعلات حسب النوع',
};
type Metric={key:string;label:string;value:number};
type Issue={metric:string;code:string;message:string};
export type PostPerformance={available:boolean;reason?:string;metrics:Metric[];issues?:Issue[];fetchedAt:string};
type Body={error?:{code?:number};access_token?:string;shares?:{count?:unknown};reactions?:{summary?:{total_count?:unknown}};comments?:{summary?:{total_count?:unknown}};data?:Array<{name?:string;values?:Array<{value?:unknown}>}>};
const numeric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

function issue(metric:string,code?:number):Issue{
 if(code===190)return {metric,code:'RECONNECT_REQUIRED',message:'انتهت صلاحية ربط Facebook؛ أعد ربط الصفحة.'};
 if(code===10||code===200)return {metric,code:'INSIGHTS_PERMISSION_REQUIRED',message:'Facebook لم يسمح بقراءة الإحصاءات. راجع منح read_insights وpages_read_engagement للصفحة وموافقة التطبيق.'};
 if(code===100)return {metric,code:'METRIC_UNAVAILABLE',message:'المقياس غير متاح لهذا المنشور أو إصدار API؛ لا تعني البيانات الناقصة صفر مشاهدة.'};
 return {metric,code:'INSIGHTS_UNAVAILABLE',message:'تعذر جلب هذا المقياس من Facebook حاليًا؛ قد تكون البيانات متأخرة أو غير متاحة.'};
}

async function getJson(path:string,token:string,fetcher:typeof fetch){
 try{
  // Credentials are header-only, including cache identity; errors never expose tokens.
  const response=await fetcher(`${base()}/${path}`,{headers:{Authorization:`Bearer ${token}`},next:{revalidate:300},signal:AbortSignal.timeout(10000)});
  const body=await response.json().catch(()=>({})) as Body;
  return {ok:response.ok&&!body.error,body};
 }catch{return {ok:false,body:{} as Body};}
}

async function pageToken(pageId:string,fetcher:typeof fetch){
 const stored=await storedPageToken(pageId);if(stored)return stored;
 if(!isGraphConfigured())return null;
 const token=process.env.META_PAGE_ACCESS_TOKEN!.trim();
 const lookup=await getJson(`${pageId}?fields=access_token`,token,fetcher);
 return lookup.ok&&typeof lookup.body.access_token==='string'?lookup.body.access_token:token;
}

export async function getPostPerformance(facebookPostId:string,facebookPageId:string,dependencies:{fetcher?:typeof fetch;resolveToken?:(id:string)=>Promise<string|null>}={}):Promise<PostPerformance>{
 const fetchedAt=new Date().toISOString(),fetcher=dependencies.fetcher??fetch;
 if(!/^\d+(?:_\d+)?$/.test(facebookPostId)||!/^\d+$/.test(facebookPageId))return {available:false,reason:'معرّف منشور Facebook غير صالح',metrics:[],fetchedAt};
 try{
  const token=await (dependencies.resolveToken??((id:string)=>pageToken(id,fetcher)))(facebookPageId);
  if(!token)return {available:false,reason:'ربط Facebook غير مُعد',metrics:[],fetchedAt};
  const [counts,...insights]=await Promise.all([
   getJson(`${facebookPostId}?fields=shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)`,token,fetcher),
   ...Object.keys(PERFORMANCE_METRICS).map(metric=>getJson(`${facebookPostId}/insights?metric=${metric}&period=lifetime`,token,fetcher)),
  ]);
  const metrics:Metric[]=[],issues:Issue[]=[];
  if(counts.ok){
   for(const [key,label,value] of [
    ['reactions','التفاعلات',counts.body.reactions?.summary?.total_count],
    ['comments','التعليقات',counts.body.comments?.summary?.total_count],
    ['shares','المشاركات',counts.body.shares?.count??(numeric(counts.body.reactions?.summary?.total_count)||numeric(counts.body.comments?.summary?.total_count)?0:undefined)],
   ] as const)if(numeric(value))metrics.push({key,label,value});
  }else issues.push(issue('engagement',counts.body.error?.code));
  Object.entries(PERFORMANCE_METRICS).forEach(([key,label],index)=>{
   const result=insights[index];
   const value=result.body.data?.find(row=>row.name===key)?.values?.[0]?.value;
   if(!result.ok||value===undefined){issues.push(issue(key,result.body.error?.code));return;}
   if(numeric(value))metrics.push({key,label,value});
   else if(key==='post_reactions_by_type_total'&&value&&typeof value==='object'&&!Array.isArray(value)){
    for(const [type,n] of Object.entries(value))if(numeric(n))metrics.push({key:`${key}.${type}`,label:`${label}: ${type}`,value:n});
   }else issues.push(issue(key));
  });
  return {available:metrics.length>0,...(!metrics.length?{reason:issues[0]?.message??'لا توجد بيانات أداء متاحة لهذا المنشور'}:{}),metrics,issues,fetchedAt};
 }catch{return {available:false,reason:'تعذر قراءة ربط Facebook؛ راجع اتصال الصفحة',metrics:[],fetchedAt};}
}

export const engagementOf=(perf:PostPerformance)=>perf.metrics.filter(m=>['reactions','comments','shares'].includes(m.key)).reduce((sum,m)=>sum+m.value,0);

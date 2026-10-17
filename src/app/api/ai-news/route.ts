import {NextRequest,NextResponse} from 'next/server';
import {sql,eq,and,desc} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '@/db';
import {facebookPages,settings} from '@/db/schema';
import {aiStories,aiReports,aiPublications,aiEvents} from '@/db/ai-news-schema';
import {guard,isUuid} from '@/services/api-guard';
import {currentUser} from '@/services/rbac';
import {SOURCES,configSchema} from '@/services/ai-news/model';
import {newsConfig,configureNews,reviewNews,composeArabic,newsEvent} from '@/services/ai-news/service';
import {RUNTIME_KEY} from '@/services/ai-news/queries';
import {validateNewsPage,reconcileNewsPost,NewsGraphError} from '@/services/elon-news/graph';

const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'no-store'}});
const unavailable=(error?:unknown)=>{
 const known:Record<string,[string,number]>={
  NEWS_BUSY_TRY_LATER:['العامل ينفذ مهمة الآن؛ أعد المراجعة بعد قليل.',409],
  PUBLICATION_IMMUTABLE:['لا يمكن تعديل خبر منشور أو جارٍ إرساله أو ذي نتيجة مجهولة.',409],
  REVIEW_EVIDENCE_REQUIRED:['راجع الأدلة والصياغة العربية، وأكّد اختلاف الحدث إذا وُجد احتمال تكرار.',400],
  ARABIC_TRANSLATOR_NOT_CONFIGURED:['لم يضبط مزود الترجمة؛ اكتب الصياغة العربية يدويًا ثم راجعها.',503],
  ARABIC_VALIDATION_FAILED:['لم تجتز الصياغة فحص العربية والأرقام. راجعها يدويًا.',409],
  NOT_FOUND:['الخبر غير موجود.',404],
 };
 const code=error instanceof Error?error.message:'';
 if(error instanceof NewsGraphError)return response({error:'تعذر التحقق من الصفحة أو المنشور. راجع صلاحيات pages_manage_posts وpages_read_engagement وصحة ربط الصفحة.',code:error.code},409);
 if(known[code])return response({error:known[code][0],code},known[code][1]);
 console.error('AI news operation failed',{code:'AI_NEWS_UNAVAILABLE'});return response({error:'تعذرت العملية. تأكد من تطبيق ترحيل قاعدة البيانات وربط الصفحة.',code:'AI_NEWS_UNAVAILABLE'},503);
};
export async function GET(request:NextRequest){
 const denied=await guard(request,false,'settings.manage');if(denied)return denied;
 try{
  const db=getDb(),id=request.nextUrl.searchParams.get('id');
  if(id){
   if(!isUuid(id))return response({error:'معرّف غير صالح'},400);
   const [story]=await db.select().from(aiStories).where(eq(aiStories.id,id)).limit(1);
   if(!story)return response({error:'الخبر غير موجود'},404);
   return response({story,reports:await db.select().from(aiReports).where(eq(aiReports.storyId,id)),
    publications:await db.select().from(aiPublications).where(eq(aiPublications.storyId,id)),
    events:await db.select().from(aiEvents).where(eq(aiEvents.storyId,id)).orderBy(desc(aiEvents.createdAt)).limit(100)});
  }
  const parsed=z.object({q:z.string().max(200).default(''),status:z.enum(['all','pending_verification','verified','rejected','queued','publishing','published','failed','uncertain']).default('all'),
   source:z.string().max(30).default(''),sort:z.enum(['newest','oldest','priority']).default('newest'),page:z.coerce.number().int().min(1).max(10000).default(1)}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if(!parsed.success)return response({error:'مرشحات غير صالحة'},400);
  const p=parsed.data,condition=sql`(${p.q}='' OR s.title ILIKE ${'%'+p.q+'%'})
   AND (${p.status}='all' OR s.status=${p.status} AND ${p.status} IN ('pending_verification','verified','rejected') OR j.status=${p.status})
   AND (${p.source}='' OR EXISTS(SELECT 1 FROM ai_news_reports r WHERE r.story_id=s.id AND r.source_id=${p.source}))`;
  const order=p.sort==='oldest'?sql`s.created_at ASC`:p.sort==='priority'?sql`s.breaking DESC,s.created_at DESC`:sql`s.created_at DESC`;
  const rows=await db.execute(sql`SELECT s.*,j.status AS publication_status,j.error_code,j.facebook_post_id,j.published_at AS facebook_published_at FROM ai_news_stories s
   LEFT JOIN ai_news_publications j ON j.story_id=s.id WHERE ${condition} ORDER BY ${order} LIMIT 20 OFFSET ${(p.page-1)*20}`);
  const total=(await db.execute(sql`SELECT count(*)::int AS count FROM ai_news_stories s LEFT JOIN ai_news_publications j ON j.story_id=s.id WHERE ${condition}`)).rows[0]?.count??0;
  const counts=(await db.execute(sql`SELECT CASE WHEN s.status='rejected' THEN s.status ELSE COALESCE(j.status,s.status) END AS status,count(*)::int AS count FROM ai_news_stories s LEFT JOIN ai_news_publications j ON j.story_id=s.id GROUP BY 1`)).rows;
  const pages=await db.select({id:facebookPages.id,name:facebookPages.name}).from(facebookPages).where(and(eq(facebookPages.isActive,true),eq(facebookPages.platform,'facebook')));
  const [runtime]=await db.select({value:settings.value}).from(settings).where(eq(settings.key,RUNTIME_KEY)).limit(1);
  const state=runtime?JSON.parse(runtime.value):{};
  return response({items:rows.rows,total,page:p.page,pageSize:20,counts,config:await newsConfig(),sources:SOURCES,pages,
   activity:await db.select().from(aiEvents).orderBy(desc(aiEvents.createdAt)).limit(30),
   scheduler:{kind:'existing-external-scheduler',tickMinutes:10,timezone:'Asia/Riyadh',lastRunAt:state.lastRunAt??null,lastPollAt:state.lastPollAt??null}});
 }catch(error){return unavailable(error);}
}
export async function PUT(request:NextRequest){
 const denied=await guard(request,true,'settings.manage');if(denied)return denied;
 const input=configSchema.safeParse(await request.json().catch(()=>null));if(!input.success)return response({error:'راجع الصفحة والمصادر والفواصل الزمنية (10 دقائق على الأقل).'},400);
 const user=await currentUser(request);if(!user||input.data.autoPublish&&!isUuid(user.id))return response({error:'استخدم حساب مدير محفوظ في قاعدة البيانات.'},403);
 try{return response({config:await configureNews(input.data,user.id)});}catch(error){return unavailable(error);}
}
export async function POST(request:NextRequest){
 const denied=await guard(request,true,'settings.manage');if(denied)return denied;
 const parsed=z.object({id:z.uuid(),action:z.enum(['verify','reject','compose','retry','reconcile']),note:z.string().trim().min(10).max(1000),
  arabicPost:z.string().max(1500).optional(),distinctConfirmed:z.boolean().optional(),breaking:z.boolean().optional(),facebookPostId:z.string().regex(/^\d+_\d+$/).optional()}).strict().safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return response({error:'أدخل ملاحظات المراجعة وبيانات الإجراء.'},400);
 const user=await currentUser(request);if(!user)return response({error:'غير مسموح'},403);
 const {id,action,...input}=parsed.data;
 try{
  if(action==='verify'||action==='reject')await reviewNews(id,{...input,action},user.email);
  else if(action==='compose'){
   const [story]=await getDb().select().from(aiStories).where(eq(aiStories.id,id)).limit(1);if(!story)return response({error:'الخبر غير موجود'},404);
   const reports=await getDb().select().from(aiReports).where(eq(aiReports.storyId,id));
   return response({post:await composeArabic(story,reports)});
  }else{
   const [job]=await getDb().select().from(aiPublications).where(eq(aiPublications.storyId,id)).limit(1);if(!job)return response({error:'لا توجد محاولة نشر'},404);
   const [page]=await getDb().select().from(facebookPages).where(and(eq(facebookPages.id,job.pageId),eq(facebookPages.isActive,true))).limit(1);if(!page)return response({error:'الصفحة غير متاحة'},409);
   const auth=await validateNewsPage(page.facebookPageId);
   if(action==='retry'){
    const rows=await getDb().update(aiPublications).set({status:'queued',nextAttemptAt:new Date(),errorCode:null})
     .where(and(eq(aiPublications.id,job.id),eq(aiPublications.status,'failed'),sql`attempts<5 AND EXISTS(SELECT 1 FROM ai_news_stories s WHERE s.id=story_id AND s.status='verified')`)).returning({id:aiPublications.id});
    if(!rows.length)return response({error:'لا يمكن إعادة نتيجة مجهولة أو منشورة، أو تجاوز خمس محاولات.'},409);
   }else{
    if(job.status!=='uncertain'||!input.facebookPostId)return response({error:'أدخل معرّف المنشور للتحقق من النتيجة المجهولة.'},409);
    const [story]=await getDb().select().from(aiStories).where(eq(aiStories.id,id)).limit(1);
    await reconcileNewsPost(auth,input.facebookPostId,story.arabicPost??'');
    await getDb().update(aiPublications).set({status:'published',facebookPostId:input.facebookPostId,publishedAt:new Date(),errorCode:null})
     .where(and(eq(aiPublications.id,job.id),eq(aiPublications.status,'uncertain')));
   }
   await newsEvent(action==='retry'?'MANUAL_SAFE_RETRY':'RECONCILED',id,{actor:user.email,note:input.note,facebookPostId:input.facebookPostId});
  }
  return response({ok:true});
 }catch(error){return unavailable(error);}
}

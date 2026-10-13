import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {planReelSchedule,type ReviewedClip} from "@/services/movie-reels/policy";
import {reservationsQuery,reserveScheduleQueries,runTransaction,scheduleSchema} from "@/services/movie-reels/pipeline";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";

const iso=(value:string|Date|null)=>value?new Date(value).toISOString():null;
const errors:Record<string,string>={MOVIE_RIGHTS_NOT_VERIFIED:"يجب توثيق حقوق الفيلم من مراجع قبل الجدولة",MOVIE_LICENSE_SCOPE_DENIED:"نطاق الترخيص لا يسمح بالنشر",MOVIE_LICENSE_EXPIRED:"الترخيص ينتهي قبل موعد أحد المقاطع",
  MOVIE_PAGE_ACCESS_DENIED:"الصفحة غير متاحة لحسابك",MOVIE_SCHEDULE_INVALID:"اختر وقت بدء في المستقبل",MOVIE_CLIP_REVIEW_REQUIRED:"كل المقاطع المختارة يجب أن تكون معتمدة مع مراجعة الترجمة",
  MOVIE_CLIP_INVALID:"أحد المقاطع غير صالح للنشر",MOVIE_CLIP_NOT_PUBLISHABLE:"أحد المقاطع غير جاهز",MOVIE_DUPLICATE_CLIP:"أحد المقاطع مجدول مسبقًا"};
type ClipRow={id:string;part_number:number;duration_ms:number;approved_by:string|null;approved_at:string|Date|null;status:string;output_storage_key:string|null;subtitle_reviewed:boolean};

/** Plans five Riyadh-day slots per page, then reserves them atomically under a per-page lock. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const context=await movieContext(request,"content.publish");
  if("response" in context)return context.response;
  const {id}=await params;
  try {
    const input=scheduleSchema.parse(await readJson(request,40000));
    if(context.allowed!==null&&!context.allowed.has(input.pageId))return json({error:errors.MOVIE_PAGE_ACCESS_DENIED},403);
    const movie=await scopedMovie(id,context.user,context.allowed);
    if(!movie)return json({error:"الفيلم غير متاح"},404);
    const db=getDb();
    const selected=input.clipIds?sql`AND id IN (${sql.join(input.clipIds.map(clip=>sql`${clip}::uuid`),sql`,`)})`:sql``;
    const clips=(await db.execute(sql`SELECT id,part_number,duration_ms,approved_by,approved_at,status,output_storage_key,subtitle_reviewed FROM movie_clips
      WHERE movie_id=${movie.id}::uuid AND status='approved' ${selected} ORDER BY part_number`)).rows as ClipRow[];
    if(!clips.length)return json({error:"لا توجد مقاطع معتمدة غير مجدولة"},409);
    if(input.clipIds&&clips.length!==input.clipIds.length)return json({error:"بعض المقاطع المختارة غير معتمدة أو مجدولة مسبقًا"},409);
    const reservations=((await db.execute(reservationsQuery(input.pageId))).rows as Array<{clip_id:string;page_id:string;scheduled_at:string|Date}>)
      .map(row=>({clipId:row.clip_id,pageId:row.page_id,scheduledAt:new Date(row.scheduled_at)}));
    let plan;
    try {
      plan=planReelSchedule({rights:{status:movie.rights_status,verifiedBy:movie.rights_verified_by,verifiedAt:iso(movie.rights_verified_at),expiresAt:iso(movie.rights_expires_at),facebookAllowed:movie.facebook_allowed,excerptsAllowed:movie.excerpts_allowed},
        clips:clips.map((clip):ReviewedClip=>({id:clip.id,part:clip.part_number,durationMs:clip.duration_ms,approvedBy:clip.approved_by,approvedAt:iso(clip.approved_at),status:clip.status,outputKey:clip.output_storage_key,subtitleReviewed:clip.subtitle_reviewed})),
        pageId:input.pageId,allowedPages:context.allowed,start:new Date(input.start),reservations});
    } catch(error){
      const code=error instanceof Error?error.message:"";
      if(errors[code])return json({error:errors[code],code},409);
      throw error;
    }
    try {await runTransaction(reserveScheduleQueries({movieId:movie.id,pageId:input.pageId,slots:plan.map(slot=>({clipId:slot.clipId,scheduledAt:slot.scheduledAt}))}));}
    catch {return json({error:"تعذر الحجز: تغيّرت المقاطع أو امتلأت حصة الصفحة اليومية أو الصفحة غير نشطة. حدّث وأعد المحاولة.",code:"MOVIE_SCHEDULE_CONFLICT"},409);}
    return json({scheduled:plan.map(slot=>({clipId:slot.clipId,scheduledAt:slot.scheduledAt.toISOString()}))},201);
  } catch(error){return failure(error,"MOVIE_SCHEDULE_FAILED","تعذر جدولة المقاطع");}
}

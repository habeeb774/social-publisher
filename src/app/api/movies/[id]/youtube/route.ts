import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";
import {runTransaction} from "@/services/movie-reels/pipeline";
import {youtubeEnabled} from "@/services/youtube/google";
import {youtubePublishingEnabled} from "@/services/youtube/publisher";
import {planYouTube,reserveYouTubeQueries,youtubeScheduleSchema} from "@/services/youtube/pipeline";
import type {ReviewedClip} from "@/services/movie-reels/policy";
const iso=(value:string|Date|null)=>value?new Date(value).toISOString():null;
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const context=await movieContext(request,"content.read");if("response" in context)return context.response;
 if(!youtubeEnabled())return json({enabled:false,rightsVerified:false,publications:[]});
 try{
  const movie=await scopedMovie((await params).id,context.user,context.allowed);if(!movie)return json({error:"الفيلم غير متاح"},404);
  const db=getDb();
  const [rights,publications]=await Promise.all([
   db.execute(sql`SELECT movie_id FROM movie_youtube_rights WHERE movie_id=${movie.id}::uuid AND rights_revision=${movie.rights_revision}`),
   db.execute(sql`SELECT p.id,c.part_number,ch.title AS channel_title,p.scheduled_at,p.privacy,p.status,p.remote_video_id,p.error_code
    FROM movie_youtube_publications p JOIN movie_clips c ON c.id=p.clip_id JOIN youtube_channels ch ON ch.id=p.channel_id WHERE p.movie_id=${movie.id}::uuid ORDER BY p.scheduled_at`),
  ]);
  return json({enabled:true,publishing:await youtubePublishingEnabled(),rightsVerified:movie.rights_status==="verified"&&rights.rows.length>0,publications:publications.rows});
 }catch(error){return failure(error,"YOUTUBE_DETAIL_UNAVAILABLE","تعذر تحميل جدول YouTube");}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const context=await movieContext(request,"content.publish");if("response" in context)return context.response;
 if(!youtubeEnabled())return json({error:"تكامل YouTube غير مفعّل"},503);
 try{
  const input=youtubeScheduleSchema.parse(await readJson(request,4000));
  const movie=await scopedMovie((await params).id,context.user,context.allowed);if(!movie)return json({error:"الفيلم غير متاح"},404);
  const db=getDb(),channel=await db.execute(sql`SELECT id FROM youtube_channels WHERE id=${input.channelId}::uuid AND active
   AND (${context.user.role}='admin' OR owner_user_id=${context.user.id}::uuid)`);
  if(!channel.rows.length)return json({error:"القناة غير متاحة لحسابك"},403);
  const rights=await db.execute(sql`SELECT movie_id FROM movie_youtube_rights WHERE movie_id=${movie.id}::uuid AND rights_revision=${movie.rights_revision}`);
  const clips=await db.execute(sql`SELECT c.* FROM movie_clips c WHERE c.movie_id=${movie.id}::uuid AND c.status IN ('approved','scheduled','published')
   AND NOT EXISTS(SELECT 1 FROM movie_youtube_publications p WHERE p.clip_id=c.id AND p.channel_id=${input.channelId}::uuid AND p.status<>'cancelled') ORDER BY part_number`);
  if(!clips.rows.length)return json({error:"لا توجد مقاطع معتمدة متاحة للجدولة على هذه القناة"},409);
  const existing=await db.execute(sql`SELECT clip_id,scheduled_at FROM movie_youtube_publications WHERE channel_id=${input.channelId}::uuid AND status<>'cancelled'`);
  type ClipRow={id:string;part_number:number;duration_ms:number;approved_by:string|null;approved_at:string|Date|null;status:string;output_storage_key:string|null;subtitle_reviewed:boolean};
  const plan=planYouTube({rights:{status:movie.rights_status,verifiedBy:movie.rights_verified_by,verifiedAt:iso(movie.rights_verified_at),
   expiresAt:iso(movie.rights_expires_at),facebookAllowed:movie.facebook_allowed,excerptsAllowed:movie.excerpts_allowed},youtubeVerified:rights.rows.length>0,
   clips:(clips.rows as ClipRow[]).map((c):ReviewedClip=>({id:c.id,part:c.part_number,durationMs:c.duration_ms,approvedBy:c.approved_by,approvedAt:iso(c.approved_at),
    status:c.status,outputKey:c.output_storage_key,subtitleReviewed:c.subtitle_reviewed})),channelId:input.channelId,start:new Date(input.start),
   reservations:(existing.rows as Array<{clip_id:string;scheduled_at:string}>).map(p=>({clipId:p.clip_id,pageId:input.channelId,scheduledAt:new Date(p.scheduled_at)}))});
  try{await runTransaction(reserveYouTubeQueries(movie.id,context,input,plan));}
  catch{return json({error:"تغيّرت الحقوق أو الاعتمادات أو امتلأت الحصة. حدّث وأعد المحاولة."},409);}
  return json({scheduled:plan.map(p=>({clipId:p.clipId,scheduledAt:p.scheduledAt.toISOString()}))},201);
 }catch(error){
  const code=error instanceof Error?error.message:"";
  if(code==="YOUTUBE_RIGHTS_REQUIRED"||code.startsWith("MOVIE_"))return json({error:"يلزم توثيق حقوق YouTube واعتماد المقاطع واختيار موعد مستقبلي ضمن صلاحية الترخيص",code},409);
  return failure(error,"YOUTUBE_SCHEDULE_FAILED","تعذر جدولة YouTube");
 }
}

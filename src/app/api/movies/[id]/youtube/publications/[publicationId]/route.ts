import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/db";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";
import {youtubeEnabled} from "@/services/youtube/google";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string;publicationId:string}>}){
 const context=await movieContext(request,"content.publish");if("response" in context)return context.response;
 if(!youtubeEnabled())return json({error:"تكامل YouTube غير مفعّل"},503);
 try{
  const {id,publicationId}=await params;z.uuid().parse(publicationId);
  z.object({action:z.literal("cancel")}).strict().parse(await readJson(request,1000));
  const movie=await scopedMovie(id,context.user,context.allowed);if(!movie)return json({error:"الفيلم غير متاح"},404);
  const result=await getDb().execute(sql`UPDATE movie_youtube_publications p SET status='cancelled',updated_at=now()
   FROM youtube_channels ch WHERE p.id=${publicationId}::uuid AND p.movie_id=${movie.id}::uuid AND p.status='scheduled'
    AND ch.id=p.channel_id AND (${context.user.role}='admin' OR ch.owner_user_id=${context.user.id}::uuid) RETURNING p.id`);
  return result.rows.length?json({cancelled:true}):json({error:"الموعد تغيّر أو بدأ الرفع؛ لا يمكن إلغاؤه"},409);
 }catch(error){return failure(error,"YOUTUBE_CANCEL_FAILED","تعذر إلغاء الموعد");}
}

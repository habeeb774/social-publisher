import {NextRequest} from "next/server";
import {getDb} from "@/db";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";
import {youtubeRightsQuery,youtubeRightsSchema} from "@/services/youtube/pipeline";
import {youtubeEnabled} from "@/services/youtube/google";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const context=await movieContext(request,"content.review");if("response" in context)return context.response;
 if(!youtubeEnabled())return json({error:"تكامل YouTube غير مفعّل"},503);
 try{
  const movie=await scopedMovie((await params).id,context.user,context.allowed);if(!movie)return json({error:"الفيلم غير متاح"},404);
  const review=youtubeRightsSchema.parse(await readJson(request,10000));
  const result=await getDb().execute(youtubeRightsQuery(movie.id,context,review));
  if(!result.rows.length)return json({error:"يلزم توثيق الحقوق الأصلية أولًا؛ أو تغيّرت النسخة. حدّث الصفحة."},409);
  return json({saved:true});
 }catch(error){return failure(error,"YOUTUBE_RIGHTS_FAILED","تعذر حفظ مراجعة حقوق YouTube");}
}

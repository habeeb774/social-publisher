import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {configuredMovieStorage} from "@/services/movie-reels/private-storage";
import {failure,json,movieContext,scopedMovie} from "@/services/movie-reels/route-context";

/** Review detail: clips, short-lived private previews, job progress and publication log. No storage keys or evidence leak. */
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const context=await movieContext(request,"content.read");
  if("response" in context)return context.response;
  const {id}=await params;
  try {
    const movie=await scopedMovie(id,context.user,context.allowed);
    if(!movie)return json({error:"الفيلم غير متاح"},404);
    const db=getDb();
    const [clips,jobs,publications,rights]=await Promise.all([
      db.execute(sql`SELECT id,part_number,start_ms,duration_ms,title,description,captions,revision,subtitle_reviewed,status,approved_at,scheduled_at,remote_reel_id,remote_permalink,output_storage_key
        FROM movie_clips WHERE movie_id=${movie.id}::uuid ORDER BY part_number`),
      db.execute(sql`SELECT id,kind,status,progress,attempts,error_message,clip_id,updated_at FROM movie_jobs WHERE movie_id=${movie.id}::uuid ORDER BY created_at DESC LIMIT 20`),
      db.execute(sql`SELECT p.id,p.clip_id,c.part_number,p.page_id,fp.name AS page_name,p.scheduled_at,p.status,p.attempts,p.remote_reel_id,p.remote_permalink,p.error_code,p.published_at
        FROM movie_publications p JOIN movie_clips c ON c.id=p.clip_id LEFT JOIN facebook_pages fp ON fp.id=p.page_id WHERE c.movie_id=${movie.id}::uuid ORDER BY p.scheduled_at`),
      db.execute(sql`SELECT r.decision,r.note,r.created_at,u.name AS reviewer FROM movie_rights_reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.movie_id=${movie.id}::uuid ORDER BY r.revision DESC LIMIT 10`),
    ]);
    let storage:ReturnType<typeof configuredMovieStorage>|null=null;
    try {storage=configuredMovieStorage();} catch {storage=null;}
    const items=await Promise.all((clips.rows as Array<Record<string,unknown>&{output_storage_key:string|null}>).map(async ({output_storage_key,...clip})=>({
      ...clip,previewUrl:storage&&output_storage_key?await storage.signRead(output_storage_key,3600).catch(()=>null):null,
    })));
    const {source_storage_key,owner_user_id,...safe}=movie;
    return json({movie:{...safe,hasSource:Boolean(source_storage_key),ownedByMe:owner_user_id===context.user.id},clips:items,jobs:jobs.rows,publications:publications.rows,rightsHistory:rights.rows,storageConfigured:Boolean(storage)});
  } catch(error){return failure(error,"MOVIE_DETAIL_UNAVAILABLE","تعذر تحميل تفاصيل الفيلم");}
}

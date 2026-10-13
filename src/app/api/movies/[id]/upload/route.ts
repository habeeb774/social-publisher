import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {configuredMovieStorage} from "@/services/movie-reels/private-storage";
import {movieFileSchema,MOVIE_PART_BYTES} from "@/services/movie-reels/upload-policy";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";

/** Starts a private multipart upload. Only metadata reaches Vercel; bytes go to signed storage URLs. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const context=await movieContext(request,"content.write");
  if("response" in context)return context.response;
  const {id}=await params;
  try {
    const file=movieFileSchema.safeParse(await readJson(request,4000));
    if(!file.success)return json({error:"الملف يجب أن يكون MP4 أو MOV بحجم لا يتجاوز 50GB"},400);
    const movie=await scopedMovie(id,context.user,context.allowed);
    if(!movie||(context.user.role!=="admin"&&movie.owner_user_id!==context.user.id))return json({error:"الفيلم غير متاح لحسابك"},404);
    if(movie.source_storage_key||movie.status!=="draft")return json({error:"تم رفع ملف هذا الفيلم مسبقًا"},409);
    if(!["pending","verified"].includes(movie.rights_status))return json({error:"لا يمكن رفع فيلم حقوقه مرفوضة أو ملغاة"},409);
    const storage=configuredMovieStorage();
    const upload=await storage.initiate(movie.id,file.data);
    const inserted=await getDb().execute(sql`INSERT INTO movie_upload_sessions(movie_id,owner_user_id,storage_key,provider_upload_id,file_name,size_bytes,mime_type)
      SELECT ${movie.id}::uuid,${context.user.id}::uuid,${upload.key},${upload.uploadId},${file.data.name},${upload.size},${upload.type}
      WHERE NOT EXISTS(SELECT 1 FROM movie_upload_sessions WHERE movie_id=${movie.id}::uuid AND status IN ('uploading','completing'))
      ON CONFLICT DO NOTHING RETURNING id`);
    if(!inserted.rows.length){
      await storage.abort({key:upload.key,uploadId:upload.uploadId}).catch(()=>undefined);
      return json({error:"يوجد رفع جارٍ لهذا الفيلم. ألغه أولًا أو انتظر اكتماله.",code:"MOVIE_UPLOAD_ACTIVE"},409);
    }
    return json({id:(inserted.rows[0] as {id:string}).id,parts:upload.parts.length,partSize:MOVIE_PART_BYTES},201);
  } catch(error){return failure(error,"MOVIE_UPLOAD_INIT_FAILED","تعذر بدء رفع الفيلم");}
}

/** Lists an unfinished session so a reloaded page can cancel it cleanly. */
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const context=await movieContext(request,"content.read");
  if("response" in context)return context.response;
  const {id}=await params;
  try {
    const movie=await scopedMovie(id,context.user,context.allowed);
    if(!movie)return json({error:"الفيلم غير متاح"},404);
    const rows=await getDb().execute(sql`SELECT id,file_name,size_bytes,status,created_at FROM movie_upload_sessions WHERE movie_id=${movie.id}::uuid AND status IN ('uploading','completing') LIMIT 1`);
    return json({session:rows.rows[0]??null});
  } catch(error){return failure(error,"MOVIE_UPLOAD_READ_FAILED","تعذر قراءة حالة الرفع");}
}

import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/db";
import {configuredMovieStorage} from "@/services/movie-reels/private-storage";
import {finalizeUploadQueries,runTransaction} from "@/services/movie-reels/pipeline";
import {failure,json,movieContext,readJson,scopedMovie} from "@/services/movie-reels/route-context";

const body=z.discriminatedUnion("action",[
  z.object({action:z.literal("sign"),number:z.number().int().min(1).max(1000)}).strict(),
  z.object({action:z.literal("complete"),parts:z.array(z.object({number:z.number().int().min(1),etag:z.string().min(1).max(200)}).strict()).min(1).max(1000)}).strict(),
  z.object({action:z.literal("abort")}).strict(),
]);
type Session={id:string;storage_key:string;provider_upload_id:string;size_bytes:string|number;mime_type:string;status:string};

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string;sessionId:string}>}){
  const context=await movieContext(request,"content.write");
  if("response" in context)return context.response;
  const {id,sessionId}=await params;
  try {
    const input=body.parse(await readJson(request,200000));
    if(!z.uuid().safeParse(sessionId).success)return json({error:"جلسة غير صالحة"},400);
    const movie=await scopedMovie(id,context.user,context.allowed);
    if(!movie)return json({error:"الفيلم غير متاح"},404);
    const db=getDb();
    const owned=sql`id=${sessionId}::uuid AND movie_id=${movie.id}::uuid AND (owner_user_id=${context.user.id}::uuid OR ${context.user.role==="admin"})`;
    const [row]=(await db.execute(sql`SELECT id,storage_key,provider_upload_id,size_bytes,mime_type,status FROM movie_upload_sessions WHERE ${owned}`)).rows as Session[];
    if(!row)return json({error:"جلسة الرفع غير موجودة"},404);
    const session={key:row.storage_key,uploadId:row.provider_upload_id,size:Number(row.size_bytes),type:row.mime_type};
    const storage=configuredMovieStorage();
    if(input.action==="sign"){
      if(row.status!=="uploading")return json({error:"جلسة الرفع لم تعد نشطة"},409);
      const [part]=await storage.signParts(session,[input.number]);
      return json({url:part.url,size:part.size});
    }
    if(input.action==="abort"){
      const changed=await db.execute(sql`UPDATE movie_upload_sessions SET status='aborted',updated_at=now() WHERE ${owned} AND status='uploading' RETURNING id`);
      if(!changed.rows.length)return json({error:"لا يمكن إلغاء الجلسة في حالتها الحالية"},409);
      await storage.abort(session).catch(()=>undefined);
      return json({ok:true});
    }
    // complete: claim, then commit with the provider; a lost response is reconciled by verifying the object.
    const claimed=await db.execute(sql`UPDATE movie_upload_sessions SET status='completing',updated_at=now() WHERE ${owned} AND status IN ('uploading','completing') RETURNING id`);
    if(!claimed.rows.length)return json({error:"جلسة الرفع منتهية"},409);
    try {await storage.complete(session,input.parts);}
    catch(error){
      const verified=await storage.verify(session).then(()=>true,()=>false);
      if(!verified){
        if(error instanceof Error&&error.message==="MOVIE_UPLOAD_INCOMPLETE")await db.execute(sql`UPDATE movie_upload_sessions SET status='uploading',updated_at=now() WHERE ${owned} AND status='completing'`);
        if(error instanceof Error&&error.message==="MOVIE_UPLOADED_FILE_INVALID"){
          await db.execute(sql`UPDATE movie_upload_sessions SET status='failed',updated_at=now() WHERE ${owned}`);
          return json({error:"الملف المرفوع ليس فيديو صالحًا",code:error.message},422);
        }
        return json({error:"تعذر تأكيد اكتمال الرفع. أعد المحاولة.",code:"MOVIE_UPLOAD_INCOMPLETE"},409);
      }
    }
    await runTransaction(finalizeUploadQueries(row.id,movie.id));
    return json({ok:true,status:"queued"});
  } catch(error){return failure(error,"MOVIE_UPLOAD_SESSION_FAILED","تعذر تنفيذ عملية الرفع");}
}

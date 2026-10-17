import {NextRequest} from "next/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/db";
import {guard} from "@/services/api-guard";
import {logAudit} from "@/services/audit";
import {runTransaction} from "@/services/movie-reels/pipeline";
import {deleteMovieFiles} from "@/services/movie-reels/private-storage";
import {json,readJson} from "@/services/movie-reels/route-context";

const confirmationSchema=z.object({confirmation:z.string().min(1).max(160)}).strict();

/**
 * Permanently removes one unpublished movie. Admin-only, same-origin, and
 * explicitly confirmed by typing the exact title. Never deletes Meta posts.
 *
 * First mark the movie as deleting so the worker cannot claim new jobs, then
 * delete its private R2 prefix, then remove related DB records in one
 * transaction. On a storage/database error, status remains "deleting": retry
 * the same request to finish instead of silently leaving orphaned files.
 */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const denied=await guard(request,true,"users.manage");
  if(denied)return denied;
  const {id}=await params;
  if(!z.uuid().safeParse(id).success)return json({error:"معرّف الفيلم غير صالح"},400);
  let body:z.infer<typeof confirmationSchema>;
  try {body=confirmationSchema.parse(await readJson(request,2000));}
  catch {return json({error:"اكتب عنوان الفيلم كما يظهر للتأكيد"},400);}

  let marked=false;
  try {
    // Cancel only not-yet-started schedules as part of the same atomic claim.
    // Active/ambiguous uploads and remotely-created Reels remain protected.
    const claimed=await getDb().execute(sql`
      WITH target AS (
        SELECT id FROM movie_assets
        WHERE id=${id}::uuid AND title=${body.confirmation}
      ), cancelled_facebook AS (
        UPDATE movie_publications p SET status='cancelled',updated_at=now()
        FROM movie_clips c, target t
        WHERE c.id=p.clip_id AND c.movie_id=t.id AND p.status='scheduled'
        RETURNING p.id
      ), cancelled_youtube AS (
        UPDATE movie_youtube_publications p SET status='cancelled',updated_at=now()
        FROM target t
        WHERE p.movie_id=t.id AND p.status='scheduled'
        RETURNING p.id
      )
      UPDATE movie_assets m SET status='deleting',updated_at=now()
      WHERE m.id IN (SELECT id FROM target)
        AND NOT EXISTS(SELECT 1 FROM movie_jobs j WHERE j.movie_id=m.id AND j.status='running')
        AND NOT EXISTS(SELECT 1 FROM movie_upload_sessions u WHERE u.movie_id=m.id AND u.status IN ('uploading','completing'))
        AND NOT EXISTS(SELECT 1 FROM movie_clips c WHERE c.movie_id=m.id AND c.status='published')
        AND NOT EXISTS(
          SELECT 1 FROM movie_publications p JOIN movie_clips c ON c.id=p.clip_id
          WHERE c.movie_id=m.id AND (p.status NOT IN ('failed','cancelled','scheduled') OR p.remote_reel_id IS NOT NULL)
        )
      RETURNING m.id
    `);
    if(!claimed.rows.length)return json({
      error:"لا يمكن حذف الفيلم الآن. تحقق من العنوان، وأوقف المعالجة أو الرفع الجاري، وألغِ الجدولة وتحقق من أي ريل قد نُشر قبل إعادة المحاولة.",
      code:"MOVIE_DELETE_NOT_ALLOWED"
    },409);
    marked=true;

    // The prefix is derived exclusively from a validated movie UUID.
    // Deleted objects are re-listed to verify removal before touching the DB.
    const filesRemoved=await deleteMovieFiles(id);

    // FK order matters: movie_jobs.clip_id also references movie_clips.
    const chunks=await runTransaction([
      sql`DELETE FROM movie_approvals WHERE clip_id IN (SELECT id FROM movie_clips WHERE movie_id=${id}::uuid)`,
      sql`DELETE FROM movie_publications WHERE clip_id IN (SELECT id FROM movie_clips WHERE movie_id=${id}::uuid)`,
      sql`DELETE FROM movie_rights_reviews WHERE movie_id=${id}::uuid`,
      sql`DELETE FROM movie_jobs WHERE movie_id=${id}::uuid`,
      sql`DELETE FROM movie_upload_sessions WHERE movie_id=${id}::uuid`,
      sql`DELETE FROM movie_clips WHERE movie_id=${id}::uuid`,
      sql`DELETE FROM movie_assets WHERE id=${id}::uuid AND status='deleting' RETURNING id`,
    ]);
    const removed=chunks.at(-1) as unknown[];
    if(!removed?.length)throw new Error("MOVIE_DELETE_DATABASE_INCOMPLETE");
    await logAudit("movie.deleted","movie",id,{title:body.confirmation,objectsDeleted:filesRemoved});
    return json({deleted:true,objectsDeleted:filesRemoved});
  } catch(error) {
    console.error("Movie delete incomplete",{code:"MOVIE_DELETE_INCOMPLETE",movieId:id,claimed:marked,reason:error instanceof Error?error.message:"unknown"});
    return json({error:marked?
      "تعذر إكمال الحذف. أُوقفت عمليات الفيلم الجديدة لحمايته. أعد المحاولة من نفس الزر؛ لن تُحذف بيانات أفلام أخرى.":
      "تعذر التحقق من إمكانية حذف الفيلم. حاول مجددًا.",code:"MOVIE_DELETE_INCOMPLETE"},503);
  }
}

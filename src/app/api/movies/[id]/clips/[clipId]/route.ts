import {NextRequest} from "next/server";
import {getDb} from "@/db";
import {editClipQuery} from "@/services/movie-reels/pipeline";
import {failure,json,movieContext,readJson} from "@/services/movie-reels/route-context";

/** Edits title/description/captions. Any edit invalidates approval; caption edits queue a burned-in re-render. */
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string;clipId:string}>}){
  const context=await movieContext(request,"content.write");
  if("response" in context)return context.response;
  const {id,clipId}=await params;
  try {
    const result=await getDb().execute(editClipQuery({movieId:id,clipId,user:context.user,allowed:context.allowed,edit:await readJson(request)}));
    if(!result.rows.length)return json({error:"تعذر الحفظ: المقطع تغيّر أو مجدول/منشور أو قيد المعالجة. حدّث الصفحة."},409);
    return json({clip:result.rows[0]});
  } catch(error){return failure(error,"MOVIE_CLIP_EDIT_FAILED","تعذر حفظ تعديل المقطع");}
}

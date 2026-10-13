import {NextRequest} from "next/server";
import {getDb} from "@/db";
import {reviewClipsQuery} from "@/services/movie-reels/pipeline";
import {failure,json,movieContext,readJson} from "@/services/movie-reels/route-context";

/** Individual or bulk approve/reject/exclude, bound to the exact revisions the reviewer saw. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const context=await movieContext(request,"content.review");
  if("response" in context)return context.response;
  const {id}=await params;
  try {
    const result=await getDb().execute(reviewClipsQuery({movieId:id,user:context.user,allowed:context.allowed,review:await readJson(request,100000)}));
    return json({changed:result.rows.length,clips:result.rows});
  } catch(error){return failure(error,"MOVIE_CLIP_REVIEW_FAILED","تعذر حفظ قرار المراجعة");}
}

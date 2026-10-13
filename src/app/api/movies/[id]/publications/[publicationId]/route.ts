import {NextRequest} from "next/server";
import {getDb} from "@/db";
import {publicationActionQuery} from "@/services/movie-reels/pipeline";
import {failure,json,movieContext,readJson} from "@/services/movie-reels/route-context";

/** Human resolution of failed/unknown sends after checking the Page, or cancelling a scheduled reel. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string;publicationId:string}>}){
  const context=await movieContext(request,"content.publish");
  if("response" in context)return context.response;
  const {id,publicationId}=await params;
  try {
    const result=await getDb().execute(publicationActionQuery({movieId:id,publicationId,user:context.user,allowed:context.allowed,body:await readJson(request,4000)}));
    if(!result.rows.length)return json({error:"لا يمكن تنفيذ الإجراء على هذا الريل في حالته الحالية"},409);
    return json({ok:true});
  } catch(error){return failure(error,"MOVIE_PUBLICATION_ACTION_FAILED","تعذر تنفيذ الإجراء");}
}

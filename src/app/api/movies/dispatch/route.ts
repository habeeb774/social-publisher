import {NextRequest,NextResponse} from "next/server";
import {guard} from "@/services/api-guard";
import {publishDueMovieReels} from "@/services/movie-reels/publisher";
import {moviePublishDriver} from "@/services/movie-reels/publish-driver";

/** Dev-only: run one publish tick against the mock driver. Still requires both publishing flags. */
export async function POST(request:NextRequest){
  const denied=await guard(request,true,"settings.manage");if(denied)return denied;
  let mock=false;try{mock=moviePublishDriver()==="mock";}catch{}
  if(process.env.NODE_ENV==="production"||!mock)return NextResponse.json({error:"Not found"},{status:404});
  return NextResponse.json(await publishDueMovieReels(1));
}

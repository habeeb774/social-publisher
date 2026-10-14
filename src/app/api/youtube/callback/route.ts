import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {guard,isUuid} from "@/services/api-guard";
import {currentUser} from "@/services/rbac";
import {getDb} from "@/db";
import {decryptToken,encryptToken} from "@/services/page-tokens";
import {exchangeCode,hashState,ownChannel,youtubeConfigured,youtubeEnabled} from "@/services/youtube/google";

export const dynamic="force-dynamic";
const back=(request:NextRequest,status:string)=>{
 const response=NextResponse.redirect(new URL(`/movies?youtube=${status}`,request.url));
 response.cookies.set("youtube_oauth","",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/api/youtube",maxAge:0});
 response.headers.set("cache-control","no-store");return response;
};
export async function GET(request:NextRequest){
 const denied=await guard(request,false,"settings.manage");if(denied)return denied;
 if(!youtubeEnabled()||!youtubeConfigured())return back(request,"missing-config");
 const user=await currentUser(request),state=request.nextUrl.searchParams.get("state");
 if(!user||!isUuid(user.id)||!state||state.length>128||state!==request.cookies.get("youtube_oauth")?.value)return back(request,"invalid-state");
 try{
  // Consume once, bound to both the authenticated DB user and browser cookie.
  const consumed=await getDb().execute(sql`DELETE FROM youtube_oauth_states WHERE state_hash=${hashState(state)}
   AND user_id=${user.id}::uuid AND expires_at>now() RETURNING verifier_enc`);
  const saved=consumed.rows[0] as {verifier_enc:string}|undefined;
  if(!saved)return back(request,"invalid-state");
  const code=request.nextUrl.searchParams.get("code");
  if(request.nextUrl.searchParams.has("error")||!code)return back(request,"cancelled");
  const token=await exchangeCode(code,decryptToken(saved.verifier_enc)),channel=await ownChannel(token.accessToken);
  const connected=await getDb().execute(sql`INSERT INTO youtube_channels(owner_user_id,channel_id,title,refresh_token_enc)
   VALUES(${user.id}::uuid,${channel.id},${channel.title},${encryptToken(token.refreshToken)})
   ON CONFLICT(channel_id) DO UPDATE SET title=excluded.title,refresh_token_enc=excluded.refresh_token_enc,active=true
   WHERE youtube_channels.owner_user_id=excluded.owner_user_id RETURNING id`);
  if(!connected.rows.length)return back(request,"channel-already-linked");
  return back(request,"connected");
 }catch{return back(request,"connection-failed");}
}

import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {guard,isUuid} from "@/services/api-guard";
import {currentUser} from "@/services/rbac";
import {getDb} from "@/db";
import {encryptToken} from "@/services/page-tokens";
import {authorizationUrl,hashState,newOAuthPair,youtubeConfigured,youtubeEnabled} from "@/services/youtube/google";

export async function POST(request:NextRequest){
 const denied=await guard(request,true,"settings.manage");if(denied)return denied;
 if(!youtubeEnabled()||!youtubeConfigured())return NextResponse.json({error:"أضف بيانات Google وفعّل تكامل YouTube أولًا"},{status:503});
 const user=await currentUser(request);
 if(!user||!isUuid(user.id))return NextResponse.json({error:"استخدم حساب مدير مسجّل"},{status:403});
 try{
  const {state,verifier}=newOAuthPair(),url=authorizationUrl(state,verifier);
  await getDb().execute(sql`INSERT INTO youtube_oauth_states(state_hash,user_id,verifier_enc,expires_at)
   VALUES(${hashState(state)},${user.id}::uuid,${encryptToken(verifier)},now()+interval '10 minutes')`);
  const response=NextResponse.json({url});
  response.cookies.set("youtube_oauth",state,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/api/youtube",maxAge:600});
  response.headers.set("cache-control","no-store");return response;
 }catch{return NextResponse.json({error:"تعذر بدء الربط؛ تحقق من إعدادات Google وترحيل قاعدة البيانات"},{status:503});}
}

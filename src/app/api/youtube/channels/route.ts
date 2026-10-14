import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {guard,isUuid} from "@/services/api-guard";
import {currentUser} from "@/services/rbac";
import {getDb} from "@/db";
import {youtubeConfigured,youtubeEnabled} from "@/services/youtube/google";
import {youtubePublishingEnabled} from "@/services/youtube/publisher";
export async function GET(request:NextRequest){
 const denied=await guard(request,false,"content.read");if(denied)return denied;
 const enabled=youtubeEnabled(),configured=youtubeConfigured();
 if(!enabled)return NextResponse.json({enabled,configured,publishing:false,channels:[]});
 const user=await currentUser(request);
 if(!user||!isUuid(user.id))return NextResponse.json({error:"استخدم حساب فريق مسجّل"},{status:403});
 try{
  const result=await getDb().execute(sql`SELECT id,channel_id,title FROM youtube_channels WHERE active
   AND (${user.role}='admin' OR owner_user_id=${user.id}::uuid) ORDER BY title`);
  return NextResponse.json({enabled,configured,publishing:youtubePublishingEnabled(),channels:result.rows},{headers:{"cache-control":"no-store"}});
 }catch{return NextResponse.json({error:"جداول YouTube غير جاهزة؛ أكمل إعداد التكامل"},{status:503});}
}

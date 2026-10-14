import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {guard} from "@/services/api-guard";
import {getDb} from "@/db";
import {decryptToken} from "@/services/page-tokens";
import {runTransaction} from "@/services/movie-reels/pipeline";
import {youtubeEnabled} from "@/services/youtube/google";
export async function POST(request:NextRequest){
 const denied=await guard(request,true,"settings.manage");if(denied)return denied;
 if(!youtubeEnabled())return NextResponse.json({error:"التكامل غير مفعّل"},{status:503});
 try{
  const input=z.object({channelId:z.uuid(),confirmed:z.literal(true)}).strict().parse(await request.json());
  const result=await getDb().execute(sql`SELECT refresh_token_enc FROM youtube_channels WHERE id=${input.channelId}::uuid AND active`);
  if(!result.rows.length)return NextResponse.json({error:"القناة غير متاحة"},{status:404});
  // Disable locally first; revoked grants cannot leave pending uploads live.
  await runTransaction([sql`UPDATE youtube_channels SET active=false WHERE id=${input.channelId}::uuid`,
   sql`UPDATE movie_youtube_publications SET status='cancelled',updated_at=now() WHERE channel_id=${input.channelId}::uuid AND status='scheduled'`]);
  const token=decryptToken((result.rows[0] as {refresh_token_enc:string}).refresh_token_enc);
  const response=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),
   headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token})});
  if(!response.ok)return NextResponse.json({error:"أُوقف الربط محليًا؛ ألغِ صلاحية التطبيق من حساب Google لإكمال سحب الوصول"},{status:503});
  await getDb().execute(sql`UPDATE youtube_channels SET refresh_token_enc='' WHERE id=${input.channelId}::uuid AND NOT active`);
  return NextResponse.json({disconnected:true});
 }catch(error){return NextResponse.json({error:error instanceof z.ZodError?"طلب غير صالح":"تعذر إكمال فك الربط؛ راجع صلاحيات التطبيق في Google"},{status:error instanceof z.ZodError?400:503});}
}

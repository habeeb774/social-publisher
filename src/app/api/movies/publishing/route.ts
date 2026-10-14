import {NextRequest,NextResponse} from "next/server";
import {guard} from "@/services/api-guard";
import {logAudit} from "@/services/audit";
import {platformPublishingEnabled,publishingAvailable,publishingControlSchema,setPlatformPublishing} from "@/services/movie-reels/publishing-control";
const headers={"cache-control":"no-store"};
async function status(){
 const [facebook,youtube]=await Promise.all([platformPublishingEnabled("facebook"),platformPublishingEnabled("youtube")]);
 return {facebook:{enabled:facebook,available:publishingAvailable("facebook")},youtube:{enabled:youtube,available:publishingAvailable("youtube")}};
}
export async function GET(request:NextRequest){
 const denied=await guard(request,false,"content.read");if(denied)return denied;
 return NextResponse.json(await status(),{headers});
}
export async function PUT(request:NextRequest){
 const denied=await guard(request,true,"settings.manage");if(denied)return denied;
 const raw=await request.text();
 if(raw.length>1024)return NextResponse.json({error:"الطلب أكبر من الحد المسموح"},{status:413});
 let input:unknown;try{input=JSON.parse(raw);}catch{return NextResponse.json({error:"طلب غير صالح"},{status:400});}
 const parsed=publishingControlSchema.safeParse(input);
 if(!parsed.success)return NextResponse.json({error:"اختر المنصة وحالة النشر وأكد الإجراء"},{status:400});
 try{
  await setPlatformPublishing(parsed.data.platform,parsed.data.enabled);
  await logAudit("movies.publishing_changed","settings",null,{platform:parsed.data.platform,enabled:parsed.data.enabled});
  return NextResponse.json(await status(),{headers});
 }catch(error){
  if(error instanceof Error&&error.message==="MOVIE_PUBLISHING_NOT_CONFIGURED")return NextResponse.json({error:"أكمل إعداد المنصة أولًا"},{status:409});
  return NextResponse.json({error:"تعذر حفظ حالة النشر؛ حاول مجددًا"},{status:503});
 }
}

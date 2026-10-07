import { NextRequest,NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { guard } from "@/services/api-guard";
import { pushConfiguration } from "@/services/push-config";
const schema=z.object({endpoint:z.url(),keys:z.object({p256dh:z.string().min(1),auth:z.string().min(1)})});
export async function GET(request:NextRequest){const denied=await guard(request,false,"content.read");if(denied)return denied;return NextResponse.json(pushConfiguration());}
export async function POST(request:NextRequest){
 const denied=await guard(request,true,"content.read");if(denied)return denied;
 if(!pushConfiguration().configured)return NextResponse.json({error:"إشعارات Push غير مهيأة بعد",code:"PUSH_NOT_CONFIGURED"},{status:503});
 const p=schema.safeParse(await request.json().catch(()=>null));
 if(!p.success||new URL(p.data.endpoint).protocol!=="https:")return NextResponse.json({error:"اشتراك غير صالح"},{status:400});
 try{
 await getDb().execute(sql`insert into push_subscriptions(endpoint,p256dh,auth,user_agent) values(${p.data.endpoint},${p.data.keys.p256dh},${p.data.keys.auth},${request.headers.get("user-agent")??""}) on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=now()`);
 return NextResponse.json({ok:true});
 }catch{console.error("Push subscription save failed",{code:"PUSH_STORAGE_UNAVAILABLE"});return NextResponse.json({error:"تعذر حفظ اشتراك الإشعارات. حاول لاحقًا."},{status:503});}
}
export async function DELETE(request:NextRequest){const denied=await guard(request,true,"content.read");if(denied)return denied;const b=await request.json().catch(()=>({}));if(typeof b.endpoint!=="string")return NextResponse.json({error:"رابط الاشتراك مطلوب"},{status:400});try{await getDb().execute(sql`delete from push_subscriptions where endpoint=${b.endpoint}`);return NextResponse.json({ok:true});}catch{console.error("Push subscription removal failed",{code:"PUSH_STORAGE_UNAVAILABLE"});return NextResponse.json({error:"تعذر إيقاف الاشتراك. حاول لاحقًا."},{status:503});}}

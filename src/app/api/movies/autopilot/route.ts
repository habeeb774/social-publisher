import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {getDb} from "@/db";
import {guard,isUuid} from "@/services/api-guard";
import {currentUser} from "@/services/rbac";
import {logAudit} from "@/services/audit";
import {autoPolicy,autopilotConfigSchema,configureAutopilot,retryCatalogDownloads} from "@/services/movie-reels/autopilot";
import {CATALOG,catalogIds} from "@/services/movie-reels/catalog";
const response=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"cache-control":"no-store"}});
export async function GET(request:NextRequest){
 const denied=await guard(request,false,"settings.manage");if(denied)return denied;
 const policy=await autoPolicy(),rows=(await getDb().execute(sql`SELECT value FROM settings WHERE key LIKE 'movie_autopilot_asset:%' ORDER BY key`)).rows as Array<{value:string}>;
 return response({policy,films:catalogIds.map(id=>({id,title:CATALOG[id].title,licensePage:CATALOG[id].licensePage})),
  imports:rows.map(row=>{const asset=JSON.parse(row.value);return {movieId:asset.movieId,catalogId:asset.catalogId,state:asset.state,error:asset.error??null,qualityChecked:Object.keys(asset.qa??{}).length};})});
}
export async function PUT(request:NextRequest){
 const denied=await guard(request,true,"settings.manage");if(denied)return denied;
 const user=await currentUser(request);if(!user||!isUuid(user.id))return response({error:"استخدم حساب مدير مسجّل"},403);
 const parsed=autopilotConfigSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return response({error:"تحقق من الوجهات وإعداد الجمهور والتأكيد"},400);
 try{const policy=await configureAutopilot(user.id,parsed.data);await logAudit("movies.autopilot_policy","settings",null,{...policy,catalog:catalogIds});return response({policy});}
 catch(error){return response({error:error instanceof Error&&error.message==="AUTOPILOT_POLICY_IMMUTABLE"?"لا يمكن تغيير الوجهات بعد تسجيل الاستيراد":"تعذر حفظ السياسة؛ تحقق من الوجهات وصلاحيات الحساب"},409);}
}
export async function POST(request:NextRequest){
 const denied=await guard(request,true,"settings.manage");if(denied)return denied;
 const user=await currentUser(request);if(!user||!isUuid(user.id))return response({error:"استخدم حساب المدير الأصلي"},403);
 const input=await request.json().catch(()=>null);if(input?.action!=="retry-download")return response({error:"طلب غير صالح"},400);
 try{const retried=await retryCatalogDownloads(user.id);await logAudit("movies.catalog_download_retry","settings",null,{retried});return response({retried});}
 catch{return response({error:"تعذرت الإعادة؛ تأكد من تشغيل السياسة والحساب الأصلي"},409);}
}

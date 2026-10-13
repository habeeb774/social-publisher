import {NextRequest,NextResponse} from "next/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {guard} from "@/services/api-guard";
import {currentUser,type Permission} from "@/services/rbac";
import {allowedPageIds} from "@/services/access-scope";
import {getDb} from "@/db";
import {movieScope} from "./pipeline";

export const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
/** Shared gate for movie routes: session/role/origin, feature flag, database user and page scope. */
export async function movieContext(request:NextRequest,permission:Permission,write=request.method!=="GET"){
  const denied=await guard(request,write,permission);
  if(denied)return {response:denied} as const;
  if(process.env.MOVIE_REELS_ENABLED!=="true")return {response:json({error:"قسم الأفلام غير مفعّل"},503)} as const;
  const user=await currentUser(request);
  if(!user||!z.uuid().safeParse(user.id).success)return {response:json({error:"استخدم حساب فريق مسجّل في قاعدة البيانات"},403)} as const;
  return {user,allowed:await allowedPageIds(user)} as const;
}
export async function scopedMovie(id:string,user:{id:string;role:string},allowed:ReadonlySet<string>|null){
  if(!z.uuid().safeParse(id).success)return null;
  const result=await getDb().execute(sql`SELECT m.id,m.title,m.status,m.owner_user_id,m.page_id,m.source_storage_key,m.rights_status,m.rights_revision,m.rights_verified_by,
    m.rights_verified_at,m.rights_expires_at,m.facebook_allowed,m.excerpts_allowed FROM movie_assets m WHERE m.id=${id}::uuid AND ${movieScope(user,allowed)}`);
  return (result.rows[0]??null) as null|{id:string;title:string;status:string;owner_user_id:string;page_id:string|null;source_storage_key:string|null;rights_status:string;rights_revision:number;
    rights_verified_by:string|null;rights_verified_at:string|Date|null;rights_expires_at:string|Date|null;facebook_allowed:boolean;excerpts_allowed:boolean};
}
export async function readJson(request:NextRequest,limit=64000){
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new SyntaxError("JSON required");
  const raw=await request.text();
  if(raw.length>limit)throw new SyntaxError("Too large");
  return JSON.parse(raw) as unknown;
}
export function failure(error:unknown,code:string,message:string){
  if(error instanceof SyntaxError||error instanceof z.ZodError)return json({error:"بيانات الطلب غير صالحة"},400);
  if(error instanceof Error&&error.message==="MOVIE_PRIVATE_STORAGE_NOT_CONFIGURED")return json({error:"التخزين الخاص للأفلام غير مهيأ بعد",code:error.message},503);
  console.error(message,{code,detail:error instanceof Error?error.message.slice(0,200):undefined});
  return json({error:message,code},503);
}

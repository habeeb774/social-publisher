import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { loginCommentTeam } from "@/services/comments/team";
import { TEAM_COOKIE } from "@/services/comments/team-token";
import { SESSION_COOKIE } from "@/services/request-auth";
import { enforceCommentsRateLimit } from "@/services/comments/store";
export async function POST(request:NextRequest){
 if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid origin"},{status:403});
 try{if(!await enforceCommentsRateLimit("team-login"))return NextResponse.json({error:"حاول لاحقًا"},{status:429});const data=z.object({email:z.email(),password:z.string().min(1).max(256)}).safeParse(await request.json().catch(()=>null));if(!data.success)return NextResponse.json({error:"بيانات غير صالحة"},{status:400});
 const token=await loginCommentTeam(data.data.email,data.data.password);if(!token)return NextResponse.json({error:"بيانات الدخول غير صحيحة"},{status:401});
 const response=NextResponse.json({ok:true});response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});response.cookies.set(TEAM_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:28800});return response;
 }catch{return NextResponse.json({error:"تعذر تسجيل الدخول"},{status:503});}
}
export async function DELETE(request:NextRequest){if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid origin"},{status:403});const response=NextResponse.json({ok:true});response.cookies.set(TEAM_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return response;}

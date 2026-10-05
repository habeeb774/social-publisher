import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { createCommentTeam,listCommentTeam,changeCommentTeam } from "@/services/comments/team";
import { commentsAudit,enforceCommentsRateLimit } from "@/services/comments/store";
export async function GET(request:NextRequest){const denied=await guard(request,false,"users.manage");if(denied)return denied;return NextResponse.json(await listCommentTeam());}
export async function POST(request:NextRequest){const denied=await guard(request,true,"users.manage");if(denied)return denied;if(!await enforceCommentsRateLimit("team-management"))return NextResponse.json({error:"حاول لاحقًا"},{status:429});
 const data=z.discriminatedUnion("action",[z.object({action:z.literal("create"),email:z.email(),name:z.string().trim().min(1).max(100),password:z.string().min(12).max(256),role:z.enum(["admin","editor","viewer"])}),z.object({action:z.literal("change"),id:z.uuid(),role:z.enum(["admin","editor","viewer"]),active:z.boolean()})]).safeParse(await request.json().catch(()=>null));
 if(!data.success)return NextResponse.json({error:"تحقق من الحقول؛ كلمة المرور 12 حرفًا على الأقل"},{status:400});
 try{const result=data.data.action==="create"?await createCommentTeam(data.data):await changeCommentTeam(data.data.id,data.data.role,data.data.active);await commentsAudit("comment.team_changed",null,{action:data.data.action});return NextResponse.json(result);}catch{return NextResponse.json({error:"تعذر الحفظ؛ قد يكون البريد مستخدمًا أو مخصصًا للمدير"},{status:409});}
}

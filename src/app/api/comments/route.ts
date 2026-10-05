import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { flags,ruleSchema,templateSchema } from "@/services/comments/rules";
import { commentsProvider } from "@/services/comments/provider";
import * as store from "@/services/comments/store";
export const dynamic="force-dynamic";
const mutation=z.discriminatedUnion("action",[
  z.object({action:z.literal("template"),id:z.uuid().optional(),input:templateSchema}),
  z.object({action:z.literal("rule"),id:z.uuid().optional(),input:ruleSchema}),
  z.object({action:z.literal("status"),ids:z.array(z.uuid()).min(1).max(50),value:z.enum(["new","unread","needs_reply","resolved","important","spam"])}),
  z.object({action:z.literal("note"),id:z.uuid(),value:z.string().trim().min(1).max(8000)}),
  z.object({action:z.literal("tag"),ids:z.array(z.uuid()).min(1).max(50),value:z.string().trim().min(1).max(80)}),
  z.object({action:z.literal("assign"),ids:z.array(z.uuid()).min(1).max(50),value:z.union([z.uuid(),z.literal("")])}),
  z.object({action:z.literal("draft"),id:z.uuid(),content:z.string().trim().min(1).max(8000),templateId:z.uuid().nullable().default(null)}),
  z.object({action:z.enum(["approve","send"]),id:z.uuid(),replyId:z.uuid()}),
  z.object({action:z.literal("sync"),from:z.iso.date(),to:z.iso.date()}).refine(v=>v.from<=v.to&&new Date(v.to).getTime()-new Date(v.from).getTime()<=31*86400000,"الفترة القصوى 31 يومًا"),
]);
function failure(error:unknown){const code=error instanceof Error?error.message:"COMMENTS_INTERNAL_ERROR";return NextResponse.json({code:code.length<100?code:"COMMENTS_INTERNAL_ERROR",error:code==="COMMENTS_REPLY_UNAVAILABLE"?"موصل Facebook الحالي لا يوفر صلاحية الرد على التعليقات.":"تعذر تنفيذ العملية؛ راجع حالة التكامل."},{status:code.includes("NOT_FOUND")?404:code.includes("UNAVAILABLE")?409:503});}
export async function GET(request:NextRequest){
  const denied=await guard(request);if(denied)return denied;
  try{
    if(!await store.enforceCommentsRateLimit("admin:read"))return NextResponse.json({code:"RATE_LIMITED"},{status:429});
    const params=request.nextUrl.searchParams;const view=params.get("view");
    if(view==="capabilities")return NextResponse.json({...await commentsProvider.capabilities(),flags:flags(),safeMode:!flags().replies,realRepliesEnabled:false});
    if(view==="templates")return NextResponse.json(await store.listQuickReplies());
    if(view==="rules")return NextResponse.json(await store.listCommentRules());
    if(view==="metrics")return NextResponse.json(await store.commentsMetrics());
    if(params.has("id")){const id=params.get("id");if(!z.uuid().safeParse(id).success)return NextResponse.json({code:"INVALID_ID"},{status:400});return NextResponse.json(await store.commentDetail(id!));}
    const cursor=params.get("cursor");if(cursor&&!z.iso.datetime({offset:true}).safeParse(cursor).success)return NextResponse.json({code:"INVALID_CURSOR"},{status:400});
    return NextResponse.json(await store.inbox(params));
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  const denied=await guard(request);if(denied)return denied;
  const parsed=mutation.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({code:"INVALID_INPUT",error:parsed.error.issues[0]?.message},{status:400});
  try{
    if(!await store.enforceCommentsRateLimit("admin:write"))return NextResponse.json({code:"RATE_LIMITED"},{status:429});
    const body=parsed.data;let result:unknown;
    if(body.action==="template")result=await store.saveQuickReply(body.input,body.id);
    else if(body.action==="rule")result=await store.saveCommentRule(body.input,body.id);
    else if(body.action==="draft")result=await store.draftReply(body.id,body.content,body.templateId);
    else if(body.action==="approve")result=await store.approveReply(body.id,body.replyId);
    else if(body.action==="send")result=await store.sendReply(body.id,body.replyId);
    else if(body.action==="sync")result=await store.syncComments(body.from,body.to);
    else if(body.action==="note")result=await store.internalAction(body.id,"note",body.value);
    else if("ids" in body)result=await Promise.all(body.ids.map(id=>store.internalAction(id,body.action,body.value)));
    return NextResponse.json(result);
  }catch(error){return failure(error);}
}

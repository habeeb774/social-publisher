import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { commentsPrincipal,commentsPageScope } from "@/services/comments/team";
import { canComment } from "@/services/comments/permissions";
import { withCommentsActor } from "@/services/comments/actor";
import { inboxFilterSchema } from "@/services/comments/filters";
import { flags,ruleSchema,templateSchema } from "@/services/comments/rules";
import { commentsProvider } from "@/services/comments/provider";
import * as store from "@/services/comments/store";
import { commentNotifications,readCommentNotifications } from "@/services/comments/notification-store";
export const dynamic="force-dynamic";
const mutation=z.discriminatedUnion("action",[
  z.object({action:z.literal("read_notifications")}),
  z.object({action:z.literal("save_view"),name:z.string().trim().min(1).max(100),filter:inboxFilterSchema}),
  z.object({action:z.literal("delete_view"),id:z.uuid()}),
  z.object({action:z.literal("template"),id:z.uuid().optional(),input:templateSchema}),
  z.object({action:z.literal("rule"),id:z.uuid().optional(),input:ruleSchema}),
  z.object({action:z.literal("status"),ids:z.array(z.uuid()).min(1).max(50),value:z.enum(["new","unread","needs_reply","resolved","important","spam"])}),
  z.object({action:z.enum(["hide","unhide"]),id:z.uuid()}),
  z.object({action:z.literal("note"),id:z.uuid(),value:z.string().trim().min(1).max(8000)}),
  z.object({action:z.literal("tag"),ids:z.array(z.uuid()).min(1).max(50),value:z.string().trim().min(1).max(80)}),
  z.object({action:z.literal("assign"),ids:z.array(z.uuid()).min(1).max(50),value:z.union([z.uuid(),z.literal("")])}),
  z.object({action:z.literal("draft"),id:z.uuid(),content:z.string().trim().min(1).max(8000),templateId:z.uuid().nullable().default(null)}),
  z.object({action:z.enum(["approve","send"]),id:z.uuid(),replyId:z.uuid()}),
  z.object({action:z.literal("sync"),from:z.iso.date(),to:z.iso.date()}).refine(v=>v.from<=v.to&&new Date(v.to).getTime()-new Date(v.from).getTime()<=31*86400000,"الفترة القصوى 31 يومًا"),
]);
function failure(error:unknown){const code=error instanceof z.ZodError?"INVALID_FILTER":error instanceof Error?error.message:"COMMENTS_INTERNAL_ERROR";return NextResponse.json({code:code.length<100?code:"COMMENTS_INTERNAL_ERROR",error:code==="COMMENTS_REPLY_UNAVAILABLE"?"موصل Facebook الحالي لا يوفر صلاحية الرد على التعليقات.":"تعذر تنفيذ العملية؛ راجع حالة التكامل."},{status:code.startsWith("INVALID")?400:code.includes("NOT_FOUND")?404:code.includes("UNAVAILABLE")?409:503});}
export async function GET(request:NextRequest){
  const principal=await commentsPrincipal(request);if(!principal)return NextResponse.json({error:"Unauthorized"},{status:401});
  const allowed=await commentsPageScope(principal);
  try{
    if(!await store.enforceCommentsRateLimit(`${principal.id}:read`))return NextResponse.json({code:"RATE_LIMITED"},{status:429});
    const params=request.nextUrl.searchParams;const view=params.get("view");
    if(view==="me")return NextResponse.json(principal);
    if(view==="notifications")return NextResponse.json(await commentNotifications(principal.id));
    if(view==="catalog"){
      const catalog=await store.inboxCatalog(principal.id);
      if(allowed===null)return NextResponse.json(catalog);
      const pages=catalog.pages.filter((page:{id:unknown})=>allowed.has(String(page.id)));
      const accounts=(catalog.accounts??[]).filter((account:{id:string})=>pages.some((page:{account_id?:string|null})=>page.account_id===account.id));
      return NextResponse.json({...catalog,pages,accounts});
    }
    if(view==="analytics"){if(allowed!==null)return NextResponse.json({error:"التحليلات العامة غير متاحة خارج نطاقك"},{status:403});return NextResponse.json(await store.commentsAdvancedAnalytics());}
    if(view==="capabilities")return NextResponse.json({...await commentsProvider.capabilities(),flags:flags(),safeMode:!flags().replies,realRepliesEnabled:flags().replies});
    if(view==="templates")return NextResponse.json(await store.listQuickReplies());
    if(view==="rules")return NextResponse.json(await store.listCommentRules());
    if(view==="metrics"){if(allowed!==null)return NextResponse.json({error:"المؤشرات العامة غير متاحة خارج نطاقك"},{status:403});return NextResponse.json(await store.commentsMetrics());}
    if(params.has("id")){
      const id=params.get("id");if(!z.uuid().safeParse(id).success)return NextResponse.json({code:"INVALID_ID"},{status:400});
      const detail=await store.commentDetail(id!);
      if(allowed!==null&&!allowed.has(String(detail.comment.page_id)))return NextResponse.json({error:"ليست لديك صلاحية لهذه الصفحة"},{status:403});
      return NextResponse.json(detail);
    }
    const result=await store.inbox(params,allowed);
    return NextResponse.json(allowed===null?result:{...result,items:result.items.filter((item:Record<string,unknown>)=>allowed.has(String(item.page_id))) });
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  const principal=await commentsPrincipal(request);if(!principal)return NextResponse.json({error:"Unauthorized"},{status:401});
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const parsed=mutation.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({code:"INVALID_INPUT",error:parsed.error.issues[0]?.message},{status:400});
  if(!canComment(principal.role,parsed.data.action==="delete_view"?"save_view":parsed.data.action))return NextResponse.json({code:"FORBIDDEN",error:"الدور لا يسمح بهذا الإجراء"},{status:403});
  const allowed=await commentsPageScope(principal);
  if(allowed!==null){
    const action=parsed.data.action;
    let ids:string[]=[];
    if(action==="status"||action==="tag"||action==="assign")ids=parsed.data.ids;
    else if(action==="hide"||action==="unhide"||action==="note"||action==="draft"||action==="approve"||action==="send")ids=[parsed.data.id];
    for(const id of ids){
      const detail=await store.commentDetail(id);
      if(!allowed.has(String(detail.comment.page_id)))return NextResponse.json({error:"ليست لديك صلاحية لهذه الصفحة"},{status:403});
    }
  }
  return withCommentsActor(principal.email,async()=>{
  try{
    if(!await store.enforceCommentsRateLimit(`${principal.id}:write`))return NextResponse.json({code:"RATE_LIMITED"},{status:429});
    const body=parsed.data;let result:unknown;
    if(body.action==="read_notifications")result=await readCommentNotifications(principal.id);
    else if(body.action==="save_view")result=await store.saveInboxView(principal.id,body.name,body.filter);
    else if(body.action==="delete_view")result=await store.deleteInboxView(principal.id,body.id);
    else if(body.action==="hide"||body.action==="unhide")result=await store.setHidden(body.id,body.action==="hide");
    else if(body.action==="template")result=await store.saveQuickReply(body.input,body.id);
    else if(body.action==="rule")result=await store.saveCommentRule(body.input,body.id);
    else if(body.action==="draft")result=await store.draftReply(body.id,body.content,body.templateId);
    else if(body.action==="approve")result=await store.approveReply(body.id,body.replyId);
    else if(body.action==="send")result=await store.sendReply(body.id,body.replyId);
    else if(body.action==="sync")result=await store.syncComments(body.from,body.to,allowed===null?null:Array.from(allowed));
    else if(body.action==="note")result=await store.internalAction(body.id,"note",body.value);
    else if("ids" in body)result=await Promise.all(body.ids.map(id=>store.internalAction(id,body.action,body.value)));
    return NextResponse.json(result);
  }catch(error){return failure(error);}
  });
}

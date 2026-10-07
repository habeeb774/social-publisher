import { z } from "zod";
export const commentStatuses=["new","unread","needs_reply","replied","resolved","important","spam","hidden","failed"] as const;
export const templateSchema=z.object({name:z.string().trim().min(1).max(100),content:z.string().trim().min(1).max(8000),category:z.string().trim().max(80).default("عام"),active:z.boolean().default(true)});
export const ruleSchema=z.object({name:z.string().trim().min(1).max(100),active:z.boolean().default(false),priority:z.number().int().min(0).max(1000).default(100),operator:z.enum(["contains","equals","starts_with","question","any"]).default("contains"),keywords:z.array(z.string().trim().min(1).max(100)).max(30).default([]),pageId:z.string().nullable().default(null),campaignId:z.uuid().nullable().default(null),authorId:z.string().max(150).nullable().default(null),postId:z.string().nullable().default(null),excludedAuthors:z.array(z.string()).max(100).default([]),excludedPosts:z.array(z.string()).max(100).default([]),action:z.enum(["reply_template","important","tag","follow_up","ignore","hide"]),templateId:z.uuid().nullable().default(null),tag:z.string().max(80).nullable().default(null),delaySeconds:z.union([z.literal(0),z.literal(30),z.literal(60),z.literal(300)]).default(60),requireApproval:z.boolean().default(true),stopAfterMatch:z.boolean().default(true),businessHours:z.boolean().default(true),workStart:z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).default("08:00"),workEnd:z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).default("23:00")}).refine(r=>r.action!=="reply_template"||r.templateId!==null,"اختر قالب الرد").refine(r=>r.operator==="question"||r.operator==="any"||r.keywords.length>0,"أضف كلمة مطابقة واحدة على الأقل");
export type CommentRule=z.infer<typeof ruleSchema>&{id:string};
export const flags=()=>({automation:process.env.COMMENT_AUTOMATION_ENABLED==="true",replies:process.env.FACEBOOK_COMMENT_REPLIES_ENABLED==="true",autoReplies:process.env.AUTO_COMMENT_REPLIES_ENABLED==="true"});
export function classify(message:string){
  const text=message.toLocaleLowerCase();
  if(/شكوى|احتيال|نصب|تهديد|استرجاع|دفع|complaint|refund|fraud|payment/.test(text))return "complaint";
  if(/سعر|بكم|كم السعر|price|cost/.test(text))return "price";
  if(/اشتري|اطلب|شراء|طلب|order|buy/.test(text))return "purchase";
  if(/شكرا|ممتاز|رائع|جميل|thank|great/.test(text))return "positive";
  if(/[؟?]/.test(text))return "question";
  return "neutral";
}
export function withinBusinessHours(now:Date){const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",hour:"2-digit",hourCycle:"h23"}).format(now));return hour>=8&&hour<23;}
export function evaluateRules(comment:{message:string;pageId:string;postId:string|null;authorId:string|null;campaignId?:string|null;isFromPage:boolean;hidden:boolean;replied:boolean;spam?:boolean},rules:CommentRule[],now=new Date()){
  if(comment.isFromPage||comment.hidden||comment.replied||comment.spam||!comment.authorId)return {matches:[],reason:!comment.authorId?"AUTHOR_ID_UNAVAILABLE":"LOOP_PROTECTION"};
  if(classify(comment.message)==="complaint")return {matches:[],reason:"HUMAN_REVIEW_REQUIRED"};
  const matches:Array<{rule:CommentRule;action:string;dueAt:Date}>=[];
  const text=comment.message.toLocaleLowerCase();
  const validRules: CommentRule[] = [];
  let invalidRules = 0;
  for (const rule of rules) {
    const parsed = ruleSchema.safeParse(rule);
    if (parsed.success && typeof rule.id === "string" && rule.id.length) validRules.push({ ...parsed.data, id: rule.id });
    else ++invalidRules;
  }
  for(const rule of validRules.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))){
    if(!rule.active||(rule.pageId&&rule.pageId!==comment.pageId)||(rule.postId&&rule.postId!==comment.postId)||rule.excludedAuthors.includes(comment.authorId)||rule.excludedPosts.includes(comment.postId??""))continue;
    if((rule.campaignId&&rule.campaignId!==comment.campaignId)||(rule.authorId&&rule.authorId!==comment.authorId))continue;
    const match=rule.operator==="any"?true:rule.operator==="question"?/[؟?]/.test(text):rule.keywords.some(k=>rule.operator==="equals"?text===k.toLocaleLowerCase():rule.operator==="starts_with"?text.startsWith(k.toLocaleLowerCase()):text.includes(k.toLocaleLowerCase()));
    if(!match)continue;
    const current=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
    const start=rule.workStart??"08:00",end=rule.workEnd??"23:00",inHours=start<=end?current>=start&&current<end:current>=start||current<end;
    matches.push({rule,action:rule.businessHours&&!inHours?"follow_up":rule.action,dueAt:new Date(now.getTime()+Math.max(0,rule.delaySeconds)*1000)});
    if(rule.stopAfterMatch)break;
  }
  return {matches,reason:matches.length?null:invalidRules?"INVALID_RULE_CONFIGURATION":"NO_RULE_MATCH"};
}
/** Permission errors and ambiguous writes are never retried. Only bounded read retries. */
export function retryRead(code:string,attempt:number){return attempt<3&&["COMMENTS_RATE_LIMITED","COMMENTS_TIMEOUT","COMMENTS_READ_TRANSIENT"].includes(code);}

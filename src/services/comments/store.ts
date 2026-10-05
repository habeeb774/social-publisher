import { neon } from "@neondatabase/serverless";
import { classify, evaluateRules, flags, type CommentRule } from "./rules";
import { commentsProvider, type RemoteComment } from "./provider";
import { currentActor } from "../audit";
const database=()=>{if(!process.env.DATABASE_URL)throw new Error("DATABASE_UNAVAILABLE");return neon(process.env.DATABASE_URL);};
type Row=Record<string,unknown>;
export async function commentsAudit(action:string,id:string|null,metadata:Row={}){
  const db=database();await db`INSERT INTO activity_logs(action,entity_type,entity_id,metadata) VALUES (${action},'facebook_comment',${id}::uuid,${JSON.stringify({actor:currentActor(),...metadata})}::jsonb)`;
}
export async function inbox(query:URLSearchParams){
  const db=database();const q=(query.get("q")??"").slice(0,200);const status=query.get("status")??"all";const page=query.get("page")??"";const cursor=query.get("cursor");
  const items=await db`SELECT c.*,p.name AS page_name FROM facebook_comments c JOIN facebook_pages p ON p.id=c.page_id WHERE (${q}='' OR c.message ILIKE ${`%${q}%`} OR c.author_name ILIKE ${`%${q}%`} OR c.post_id=${q}) AND (${status}='all' OR c.status=${status} OR (${status}='needs_reply' AND c.needs_reply)) AND (${page}='' OR c.page_id::text=${page}) AND (${cursor}::timestamptz IS NULL OR c.created_time<${cursor}::timestamptz) ORDER BY c.created_time DESC,c.id DESC LIMIT 51`;
  return {items:items.slice(0,50),nextCursor:items.length>50?items[49].created_time:null};
}
export async function commentDetail(id:string){
  const db=database();const [comment]=await db`SELECT c.*,p.name AS page_name,p.facebook_page_id FROM facebook_comments c JOIN facebook_pages p ON p.id=c.page_id WHERE c.id=${id}::uuid`;
  if(!comment)throw new Error("COMMENT_NOT_FOUND");
  const [thread,replies,notes,tags,users,related]=await Promise.all([
    db`SELECT * FROM facebook_comments WHERE parent_facebook_comment_id=${comment.facebook_comment_id} ORDER BY created_time LIMIT 100`,
    db`SELECT * FROM comment_replies WHERE comment_id=${id}::uuid ORDER BY created_at LIMIT 100`,
    db`SELECT * FROM comment_notes WHERE comment_id=${id}::uuid ORDER BY created_at LIMIT 100`,
    db`SELECT t.* FROM comment_tags t JOIN comment_tag_links l ON l.tag_id=t.id WHERE l.comment_id=${id}::uuid`,
    db`SELECT id,name,email FROM users ORDER BY name LIMIT 100`,
    db`SELECT p.id,p.content,p.facebook_permalink,p.published_at,c.name AS campaign_name FROM posts p LEFT JOIN campaigns c ON c.id=p.campaign_id WHERE p.facebook_post_id=${comment.post_id} LIMIT 1`,
  ]);
  return {comment,thread,replies,notes,tags,users,post:related[0]??null};
}
export async function commentsMetrics(){
  const db=database();const [totals,replies,lastSync,lastComment,rules]=await Promise.all([
    db`SELECT count(*)::int AS total,count(*) FILTER(WHERE (created_time AT TIME ZONE 'Asia/Riyadh')::date=(now() AT TIME ZONE 'Asia/Riyadh')::date)::int AS today,count(*) FILTER(WHERE needs_reply)::int AS needs_reply,count(*) FILTER(WHERE status='replied')::int AS replied FROM facebook_comments WHERE NOT is_from_page`,
    db`SELECT count(*) FILTER(WHERE r.status='sent')::int AS sent,count(*) FILTER(WHERE r.status='failed')::int AS failed,count(*) FILTER(WHERE r.status='sent' AND r.reply_type='automation')::int AS automated,count(*) FILTER(WHERE r.status='sent' AND r.reply_type!='automation')::int AS manual,avg(extract(epoch FROM (r.sent_at-c.created_time))) FILTER(WHERE r.sent_at IS NOT NULL AND r.sent_at>=c.created_time) AS avg_response_seconds FROM comment_replies r JOIN facebook_comments c ON c.id=r.comment_id`,
    db`SELECT * FROM comments_sync_runs ORDER BY started_at DESC LIMIT 1`,
    db`SELECT created_time FROM facebook_comments ORDER BY created_time DESC LIMIT 1`,
    db`SELECT rule_id,status,count(*)::int AS count FROM comment_automation_events GROUP BY rule_id,status`,
  ]);
  return {...totals[0],...replies[0],lastSync:lastSync[0]??null,lastComment:lastComment[0]?.created_time??null,rules};
}
export async function listQuickReplies(){return database()`SELECT * FROM quick_replies ORDER BY updated_at DESC LIMIT 200`;}
export async function saveQuickReply(input:{name:string;content:string;category:string;active:boolean},id?:string){
  const db=database();const [row]=id?await db`UPDATE quick_replies SET name=${input.name},content=${input.content},category=${input.category},active=${input.active},updated_at=now() WHERE id=${id}::uuid RETURNING *`:await db`INSERT INTO quick_replies(name,content,category,active,created_by) VALUES(${input.name},${input.content},${input.category},${input.active},${currentActor()}) RETURNING *`;
  if(!row)throw new Error("NOT_FOUND");await commentsAudit("comment.template_saved",null,{templateId:row.id});return row;
}
export async function listCommentRules(){return database()`SELECT * FROM comment_rules ORDER BY priority,id LIMIT 200`;}
export async function saveCommentRule(input:Omit<CommentRule,"id">,id?:string){
  const db=database();if(input.templateId){const rows=await db`SELECT id FROM quick_replies WHERE id=${input.templateId}::uuid AND active`;if(!rows.length)throw new Error("TEMPLATE_UNAVAILABLE");}
  const [row]=id?await db`UPDATE comment_rules SET name=${input.name},active=${input.active},priority=${input.priority},config=${JSON.stringify(input)}::jsonb,updated_at=now() WHERE id=${id}::uuid RETURNING *`:await db`INSERT INTO comment_rules(name,active,priority,config,created_by) VALUES(${input.name},${input.active},${input.priority},${JSON.stringify(input)}::jsonb,${currentActor()}) RETURNING *`;
  if(!row)throw new Error("NOT_FOUND");await commentsAudit("comment.rule_saved",null,{ruleId:row.id});return row;
}
export async function internalAction(id:string,action:string,value:string){
  const db=database();await commentDetail(id);
  if(action==="status")await db`UPDATE facebook_comments SET status=${value},needs_reply=${!["resolved","replied","spam","hidden"].includes(value)},updated_at=now() WHERE id=${id}::uuid`;
  else if(action==="note")await db`INSERT INTO comment_notes(comment_id,body,author) VALUES(${id}::uuid,${value},${currentActor()})`;
  else if(action==="assign")await db`UPDATE facebook_comments SET assigned_to=${value||null}::uuid,updated_at=now() WHERE id=${id}::uuid`;
  else if(action==="tag")await db.transaction([
    db`INSERT INTO comment_tags(name) VALUES(${value}) ON CONFLICT(name) DO NOTHING`,
    db`INSERT INTO comment_tag_links(comment_id,tag_id) SELECT ${id}::uuid,id FROM comment_tags WHERE name=${value} ON CONFLICT DO NOTHING`,
  ]);
  await commentsAudit(`comment.${action}`,id,{value});return {ok:true};
}
export async function draftReply(id:string,content:string,templateId:string|null){
  const db=database();await commentDetail(id);
  if(templateId){const rows=await db`SELECT id FROM quick_replies WHERE id=${templateId}::uuid AND active`;if(!rows.length)throw new Error("TEMPLATE_UNAVAILABLE");}
  const [row]=await db`INSERT INTO comment_replies(comment_id,content,reply_type,status,sent_by,template_id) VALUES(${id}::uuid,${content},${templateId?"template":"manual"},'draft',${currentActor()},${templateId}::uuid) RETURNING *`;
  await commentsAudit("comment.reply_draft",id,{replyId:row.id});return row;
}
export async function approveReply(id:string,replyId:string){
  const db=database();const [row]=await db`UPDATE comment_replies SET status='approved',approved_by=${currentActor()},updated_at=now() WHERE id=${replyId}::uuid AND comment_id=${id}::uuid AND status IN ('draft','pending_approval') RETURNING *`;
  if(!row)throw new Error("REPLY_NOT_PENDING");await commentsAudit("comment.reply_approved",id,{replyId});return row;
}
export async function sendReply(id:string,replyId:string){
  const detail=await commentDetail(id);const reply=detail.replies.find(r=>r.id===replyId);if(!reply)throw new Error("REPLY_NOT_FOUND");
  const caps=await commentsProvider.capabilities();
  if(!caps.reply){await commentsAudit("comment.reply_blocked",id,{replyId,code:"COMMENTS_REPLY_UNAVAILABLE"});throw new Error("COMMENTS_REPLY_UNAVAILABLE");}
  // Fail closed even if a future provider enables actions: rollout requires an audited sender.
  if(!flags().replies)return {dryRun:true,providerReached:true,realReply:false};
  throw new Error("COMMENTS_SENDER_NOT_IMPLEMENTED");
}
export async function ingestComment(pageId:string,remote:RemoteComment,pageRemoteId:string){
  const db=database();const fromPage=remote.authorId===pageRemoteId;const sentiment=classify(remote.message);
  const [row]=await db`INSERT INTO facebook_comments(page_id,post_id,facebook_comment_id,parent_facebook_comment_id,author_id,author_name,author_avatar,message,created_time,permalink,sentiment,is_from_page,is_hidden,needs_reply,status) VALUES(${pageId}::uuid,${remote.postId},${remote.id},${remote.parentId},${remote.authorId},${remote.authorName},${remote.authorAvatar},${remote.message},${remote.createdTime.toISOString()},${remote.permalink},${sentiment},${fromPage},${remote.hidden},${!fromPage&&!remote.hidden},${remote.hidden?"hidden":fromPage?"resolved":"unread"}) ON CONFLICT(facebook_comment_id) DO UPDATE SET message=excluded.message,is_hidden=excluded.is_hidden,last_synced_at=now(),updated_at=now() RETURNING *, (xmax=0) AS inserted`;
  if(!row.inserted)return false;
  await commentsAudit("comment.received",String(row.id),{remoteId:remote.id});
  if(!fromPage)await db`INSERT INTO notifications(type,title,message) VALUES('comment_new','تعليق جديد',${remote.message.slice(0,300)})`;
  if(sentiment==="complaint")await db`INSERT INTO notifications(type,title,message) VALUES('comment_review','تعليق يحتاج مراجعة بشرية',${remote.message.slice(0,300)})`;
  if(flags().automation)await planAutomation(row);
  return true;
}
async function planAutomation(comment:Row){
  const rules=(await listCommentRules()).map(r=>({...r.config as Omit<CommentRule,"id">,id:String(r.id)}));
  const result=evaluateRules({message:String(comment.message),pageId:String(comment.page_id),postId:comment.post_id as string|null,authorId:comment.author_id as string|null,isFromPage:Boolean(comment.is_from_page),hidden:Boolean(comment.is_hidden),replied:comment.status==="replied"},rules);
  const db=database();if(result.reason){await db`INSERT INTO comment_automation_events(comment_id,status,reason) VALUES(${String(comment.id)}::uuid,'skipped',${result.reason})`;return;}
  for(const match of result.matches){
    const [event]=await db`INSERT INTO comment_automation_events(comment_id,rule_id,status) VALUES(${String(comment.id)}::uuid,${match.rule.id}::uuid,'matched') ON CONFLICT DO NOTHING RETURNING id`;if(!event)continue;
    if(match.action==="reply_template"){
      const [template]=await db`SELECT content FROM quick_replies WHERE id=${match.rule.templateId}::uuid AND active`;
      if(template)await db`INSERT INTO comment_replies(comment_id,content,reply_type,status,rule_id,template_id,due_at) VALUES(${String(comment.id)}::uuid,${String(template.content)},'automation','pending_approval',${match.rule.id}::uuid,${match.rule.templateId}::uuid,${match.dueAt.toISOString()}) ON CONFLICT DO NOTHING`;
    }else if(match.action==="important")await internalAction(String(comment.id),"status","important");
    else if(match.action==="tag"&&match.rule.tag)await internalAction(String(comment.id),"tag",match.rule.tag);
    await commentsAudit("comment.automation_matched",String(comment.id),{ruleId:match.rule.id,action:match.action});
  }
}
/** Manual reads only until a supported polling frequency/rate limit is confirmed. */
export async function syncComments(from:string,to:string){
  const db=database();const [run]=await db`INSERT INTO comments_sync_runs(status) VALUES('running') RETURNING id`;
  let imported=0;
  try{
    const pages=await db`SELECT id,facebook_page_id FROM facebook_pages WHERE is_active`;
    for(const page of pages){const rows=await commentsProvider.listPostComments(String(page.facebook_page_id),from,to);for(const remote of rows)if(await ingestComment(String(page.id),remote,String(page.facebook_page_id)))imported++;}
    await db`UPDATE comments_sync_runs SET status='success',imported=${imported},finished_at=now() WHERE id=${String(run.id)}::uuid`;return {imported};
  }catch(error){const code=error instanceof Error?error.message:"COMMENTS_READ_FAILED";await db`UPDATE comments_sync_runs SET status='blocked',error_code=${code.slice(0,100)},finished_at=now() WHERE id=${String(run.id)}::uuid`;throw error;}
}
export async function enforceCommentsRateLimit(key:string){
  const db=database();const [row]=await db`INSERT INTO comment_api_limits(key) VALUES(${key}) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN comment_api_limits.window_at<now()-interval '1 minute' THEN 1 ELSE comment_api_limits.count+1 END,window_at=CASE WHEN comment_api_limits.window_at<now()-interval '1 minute' THEN now() ELSE comment_api_limits.window_at END RETURNING count`;
  return Number(row.count)<=60;
}

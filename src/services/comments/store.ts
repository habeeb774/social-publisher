import { neon } from "@neondatabase/serverless";
import { classify, evaluateRules, flags, type CommentRule } from "./rules";
import { commentsProvider, type RemoteComment } from "./provider";
import { commentsActor as currentActor } from "./actor";
import { filterParams,decodeCommentCursor,encodeCommentCursor,inboxFilterSchema,type InboxFilter } from "./filters";
const database=()=>{if(!process.env.DATABASE_URL)throw new Error("DATABASE_UNAVAILABLE");return neon(process.env.DATABASE_URL);};
type Row=Record<string,unknown>;
export async function commentsAudit(action:string,id:string|null,metadata:Row={}){
  const db=database();await db`INSERT INTO activity_logs(action,entity_type,entity_id,metadata) VALUES (${action},'facebook_comment',${id}::uuid,${JSON.stringify({actor:currentActor(),...metadata})}::jsonb)`;
}
export async function inbox(query:URLSearchParams){
  const db=database();const f=filterParams(query),cursor=decodeCommentCursor(query.get("cursor"));
  const items=await db`SELECT c.*,p.name AS page_name,to_char(c.created_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM facebook_comments c JOIN facebook_pages p ON p.id=c.page_id WHERE
  (${f.q}='' OR c.message ILIKE ${`%${f.q}%`} OR c.author_name ILIKE ${`%${f.q}%`} OR c.post_id=${f.q} OR EXISTS(SELECT 1 FROM comment_tag_links l JOIN comment_tags t ON t.id=l.tag_id WHERE l.comment_id=c.id AND t.name ILIKE ${`%${f.q}%`}))
  AND (${f.status}='all' OR c.status=${f.status} OR (${f.status}='needs_reply' AND c.needs_reply)) AND (${f.page}='' OR c.page_id::text=${f.page})
  AND (${f.post}='' OR c.post_id=${f.post}) AND (${f.from}='' OR (c.created_time AT TIME ZONE 'Asia/Riyadh')::date>=NULLIF(${f.from},'')::date) AND (${f.to}='' OR (c.created_time AT TIME ZONE 'Asia/Riyadh')::date<=NULLIF(${f.to},'')::date)
  AND (${f.assigned}='' OR c.assigned_to::text=${f.assigned} OR (${f.assigned}='unassigned' AND c.assigned_to IS NULL)) AND (${f.sentiment}='' OR c.sentiment=${f.sentiment})
  AND (${f.tag}='' OR EXISTS(SELECT 1 FROM comment_tag_links l JOIN comment_tags t ON t.id=l.tag_id WHERE l.comment_id=c.id AND t.name=${f.tag}))
  AND (${f.replyType}='' OR EXISTS(SELECT 1 FROM comment_replies r WHERE r.comment_id=c.id AND r.reply_type=${f.replyType})) AND (${f.rule}='' OR EXISTS(SELECT 1 FROM comment_automation_events e WHERE e.comment_id=c.id AND e.rule_id::text=${f.rule}))
  AND (${cursor?.time??null}::timestamptz IS NULL OR (c.created_time,c.id)<(${cursor?.time??null}::timestamptz,${cursor?.id??null}::uuid)) ORDER BY c.created_time DESC,c.id DESC LIMIT 51`;
  return {items:items.slice(0,50),nextCursor:items.length>50?encodeCommentCursor(String(items[49].cursor_time),String(items[49].id)):null};
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
  const history=comment.author_id?await db`SELECT id,message,created_time,status FROM facebook_comments WHERE author_id=${comment.author_id} AND page_id=${comment.page_id}::uuid ORDER BY created_time DESC LIMIT 10`:[];
  const [authorTotal]=comment.author_id?await db`SELECT count(*)::int AS count FROM facebook_comments WHERE author_id=${comment.author_id} AND page_id=${comment.page_id}::uuid`:[{count:0}];
  return {comment,thread,replies,notes,tags,users,post:related[0]??null,history,authorTotal:comment.author_id?authorTotal.count:null};
}
export async function inboxCatalog(owner:string){const db=database();const [pages,users,tags,views,campaigns]=await Promise.all([db`SELECT id,name FROM facebook_pages WHERE is_active`,db`SELECT id,name,email FROM users ORDER BY name LIMIT 100`,db`SELECT id,name FROM comment_tags ORDER BY name LIMIT 200`,db`SELECT id,name,query FROM saved_filters WHERE scope=${`comments:${owner}`} ORDER BY created_at DESC LIMIT 50`,db`SELECT id,name FROM campaigns ORDER BY name LIMIT 200`]);return {pages,users,tags,campaigns,views:views.map(v=>({...v,filter:inboxFilterSchema.parse(JSON.parse(String(v.query)))}))};}
export async function saveInboxView(owner:string,name:string,filter:InboxFilter){const [view]=await database()`INSERT INTO saved_filters(name,scope,query) VALUES(${name},${`comments:${owner}`},${JSON.stringify(filter)}) RETURNING id`;return view;}
export async function deleteInboxView(owner:string,id:string){await database()`DELETE FROM saved_filters WHERE id=${id}::uuid AND scope=${`comments:${owner}`}`;return {ok:true};}
export async function commentsAdvancedAnalytics(){
 const db=database();const [response,keywords,byPost,byRule]=await Promise.all([
 db`SELECT count(*)::int AS total,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM comment_replies r WHERE r.comment_id=c.id AND r.status='sent' AND r.sent_at IS NOT NULL))::int AS answered FROM facebook_comments c WHERE NOT c.is_from_page`,
 db`SELECT word,count(*)::int AS count FROM facebook_comments c CROSS JOIN LATERAL regexp_split_to_table(lower(c.message),'[^[:alnum:]ء-ي]+') word WHERE NOT c.is_from_page AND length(word)>2 AND word NOT IN ('على','الى','إلى','هذا','هذه','with','that','the','for','and') GROUP BY word ORDER BY count DESC,word LIMIT 15`,
 db`SELECT c.post_id,count(*)::int AS count,max(p.content) AS content FROM facebook_comments c LEFT JOIN posts p ON p.facebook_post_id=c.post_id WHERE NOT c.is_from_page GROUP BY c.post_id ORDER BY count DESC LIMIT 20`,
 db`SELECT r.id,r.name,(SELECT count(*)::int FROM comment_automation_events e WHERE e.rule_id=r.id AND e.status='matched') AS matched,(SELECT count(*)::int FROM comment_automation_events e WHERE e.rule_id=r.id AND e.status='skipped') AS skipped,(SELECT count(*)::int FROM comment_replies p WHERE p.rule_id=r.id AND p.status='sent') AS replied,(SELECT count(*)::int FROM comment_replies p WHERE p.rule_id=r.id AND p.status='failed') AS failed,(SELECT count(*)::int FROM comment_replies p WHERE p.rule_id=r.id AND p.status='pending_approval') AS human_review FROM comment_rules r ORDER BY r.priority LIMIT 200`,
 ]);const total=Number(response[0].total),answered=Number(response[0].answered);return {total,answered,unanswered:total-answered,responseRate:total?Math.round(answered/total*10000)/100:null,keywords,byPost,byRule};
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
  if(input.action==="hide")throw new Error("COMMENTS_HIDE_UNAVAILABLE");
  const db=database();if(input.templateId){const rows=await db`SELECT id FROM quick_replies WHERE id=${input.templateId}::uuid AND active`;if(!rows.length)throw new Error("TEMPLATE_UNAVAILABLE");}
  const [row]=id?await db`UPDATE comment_rules SET name=${input.name},active=${input.active},priority=${input.priority},config=${JSON.stringify(input)}::jsonb,updated_at=now() WHERE id=${id}::uuid RETURNING *`:await db`INSERT INTO comment_rules(name,active,priority,config,created_by) VALUES(${input.name},${input.active},${input.priority},${JSON.stringify(input)}::jsonb,${currentActor()}) RETURNING *`;
  if(!row)throw new Error("NOT_FOUND");await commentsAudit("comment.rule_saved",null,{ruleId:row.id});return row;
}
export async function internalAction(id:string,action:string,value:string){
  const db=database();await commentDetail(id);
  if(action==="assign"&&value){const rows=await db`SELECT id FROM users WHERE id=${value}::uuid`;if(!rows.length)throw new Error("USER_NOT_FOUND");}
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
  if(templateId)await db`UPDATE quick_replies SET usage_count=usage_count+1 WHERE id=${templateId}::uuid`;
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
  // Real sends stay off until FACEBOOK_COMMENT_REPLIES_ENABLED=true.
  if(!flags().replies)return {dryRun:true,providerReached:false,realReply:false};
  // Claim atomically so a double click or a second tab can never send twice.
  const db=database();
  const [claimed]=await db`UPDATE comment_replies SET status='sending',provider='graph_api',sent_by=${currentActor()},updated_at=now() WHERE id=${replyId}::uuid AND comment_id=${id}::uuid AND status IN ('approved','failed') RETURNING id`;
  if(!claimed)throw new Error("REPLY_NOT_APPROVED");
  try{
    const sent=await commentsProvider.replyToComment(String(detail.comment.facebook_page_id),String(detail.comment.facebook_comment_id),String(reply.content));
    await db`UPDATE comment_replies SET status='sent',facebook_reply_id=${sent.id},sent_at=now(),error_code=NULL,error_message=NULL,updated_at=now() WHERE id=${replyId}::uuid`;
    await db`UPDATE facebook_comments SET status='replied',needs_reply=false WHERE id=${id}::uuid`;
    await commentsAudit("comment.reply_sent",id,{replyId,facebookReplyId:sent.id});
    return {dryRun:false,realReply:true,facebookReplyId:sent.id};
  }catch(error){
    const message=error instanceof Error?error.message:"COMMENTS_REPLY_FAILED";
    // An unknown outcome is never retried automatically: the reply may already be on Facebook.
    const unknown=message==="COMMENTS_REPLY_OUTCOME_UNKNOWN";
    await db`UPDATE comment_replies SET status=${unknown?"outcome_unknown":"failed"},failed_at=now(),error_code=${unknown?message:"FACEBOOK_GRAPH_ERROR"},error_message=${message.slice(0,500)},updated_at=now() WHERE id=${replyId}::uuid`;
    await commentsAudit("comment.reply_failed",id,{replyId,code:message.slice(0,100)});
    throw error;
  }
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
  const [relatedPost]=await database()`SELECT campaign_id FROM posts WHERE facebook_post_id=${comment.post_id as string|null} LIMIT 1`;
  const rules=(await listCommentRules()).map(r=>({...r.config as Omit<CommentRule,"id">,id:String(r.id)}));
  const result=evaluateRules({message:String(comment.message),pageId:String(comment.page_id),postId:comment.post_id as string|null,authorId:comment.author_id as string|null,campaignId:relatedPost?.campaign_id as string|null,spam:comment.status==="spam",isFromPage:Boolean(comment.is_from_page),hidden:Boolean(comment.is_hidden),replied:comment.status==="replied"},rules);
  const db=database();if(result.reason){await db`INSERT INTO comment_automation_events(comment_id,status,reason) VALUES(${String(comment.id)}::uuid,'skipped',${result.reason})`;return;}
  for(const match of result.matches){
    const [event]=await db`INSERT INTO comment_automation_events(comment_id,rule_id,status) VALUES(${String(comment.id)}::uuid,${match.rule.id}::uuid,'matched') ON CONFLICT DO NOTHING RETURNING id`;if(!event)continue;
    if(match.action==="reply_template"){
      const [template]=await db`SELECT content FROM quick_replies WHERE id=${match.rule.templateId}::uuid AND active`;
      if(template)await db`INSERT INTO comment_replies(comment_id,content,reply_type,status,rule_id,template_id,due_at) VALUES(${String(comment.id)}::uuid,${String(template.content)},'automation','pending_approval',${match.rule.id}::uuid,${match.rule.templateId}::uuid,${match.dueAt.toISOString()}) ON CONFLICT DO NOTHING`;
      if(template)await db`INSERT INTO notifications(type,title,message) VALUES('comment_approval','رد بانتظار الموافقة',${String(comment.message).slice(0,300)})`;
    }else if(match.action==="important"){await internalAction(String(comment.id),"status","important");await db`INSERT INTO notifications(type,title,message) VALUES('comment_important','تعليق مهم',${String(comment.message).slice(0,300)})`;}
    else if(match.action==="follow_up")await internalAction(String(comment.id),"status","needs_reply");
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

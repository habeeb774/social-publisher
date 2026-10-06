import { callTool, contentJson, discoverWindsorPublishing } from "../windsor-mcp";
import { isGraphConfigured, listPageCommentsGraph, replyToCommentGraph, setCommentHiddenGraph } from "../facebook-graph";
import { hasStoredFacebookPageToken, storedPageToken } from "../page-tokens";

export type RemoteComment = { id:string; pageId:string; postId:string|null; parentId:string|null; message:string; createdTime:Date; hidden:boolean; authorId:string|null; authorName:string|null; authorAvatar:string|null; permalink:string|null };
export type CommentsCapabilities = { connected:boolean; pageIds:string[]; read:boolean; repliesRead:boolean; reply:boolean; hide:boolean; unhide:boolean; delete:boolean; author:boolean; permalink:boolean; webhook:boolean; rateLimitKnown:boolean; reason:string|null; checkedAt:string };
export interface FacebookCommentsProvider {
  capabilities():Promise<CommentsCapabilities>;
  listPostComments(pageId:string, from:string, to:string):Promise<RemoteComment[]>;
  getComment(pageId:string, commentId:string, from:string, to:string):Promise<RemoteComment|null>;
  getReplies(pageId:string, commentId:string, from:string, to:string):Promise<RemoteComment[]>;
  replyToComment(pageId:string, commentId:string, content:string):Promise<{id:string}>;
  hideComment(pageId:string, commentId:string):Promise<void>;
  unhideComment(pageId:string, commentId:string):Promise<void>;
  markHandled(commentId:string):Promise<void>;
}
const unwrap=(v:unknown):unknown=>v&&typeof v==="object"&&"result" in v?unwrap((v as {result:unknown}).result):v;
export const COMMENT_FIELDS=["account_id","post_id","comment_id","comment_parent_id","comment_text","comment_timestamp","comment_is_hidden"];

/** No Graph API fallback. Only the officially discovered Windsor fields are requested. */
export class WindsorFacebookCommentsProvider implements FacebookCommentsProvider {
  async capabilities():Promise<CommentsCapabilities> {
    const checkedAt=new Date().toISOString();
    // The Graph page token (pages_read_engagement + pages_manage_engagement) covers read, authors and replies.
    if(isGraphConfigured() || await hasStoredFacebookPageToken())return {connected:true,pageIds:[],read:true,repliesRead:true,reply:true,hide:true,unhide:true,delete:false,author:true,permalink:true,webhook:false,rateLimitKnown:false,reason:null,checkedAt};
    try {
      const discovery=await discoverWindsorPublishing();
      const connectors=unwrap(discovery.connectors) as Array<{id:string;accounts?:Array<{id:string}>}>;
      const pageIds=(connectors.find(c=>c.id==="facebook_organic")?.accounts??[]).map(a=>String(a.id));
      const result=await callTool("get_fields",{connector:"facebook_organic"},discovery.sessionId);
      const fields=unwrap(contentJson(result.payload.result)) as Array<{id:string}>;
      const ids=new Set(Array.isArray(fields)?fields.map(f=>f.id):[]);
      const read=COMMENT_FIELDS.every(id=>ids.has(id));
      // Windsor has no reply action; replies go through the Graph page token when one is configured.
      const reply=isGraphConfigured();
      return {connected:pageIds.length>0,pageIds,read,repliesRead:read&&ids.has("comment_parent_id"),reply,hide:false,unhide:false,delete:false,author:false,permalink:false,webhook:false,rateLimitKnown:false,reason:!read?"COMMENTS_READ_UNAVAILABLE":reply?null:"COMMENTS_REPLY_UNAVAILABLE",checkedAt};
    } catch {return {connected:false,pageIds:[],read:false,repliesRead:false,reply:false,hide:false,unhide:false,delete:false,author:false,permalink:false,webhook:false,rateLimitKnown:false,reason:"COMMENTS_AUTH_REQUIRED",checkedAt};}
  }
  async listPostComments(pageId:string,from:string,to:string):Promise<RemoteComment[]> {
    if((await storedPageToken(pageId)) || isGraphConfigured()){
      const rows=await listPageCommentsGraph(pageId,new Date(`${from}T00:00:00Z`),new Date(`${to}T23:59:59Z`));
      return rows.map(c=>({id:c.id,pageId,postId:c.postId,parentId:c.parentId,message:c.message,createdTime:new Date(c.createdTime),hidden:c.hidden,authorId:c.authorId,authorName:c.authorName,authorAvatar:null,permalink:c.permalink}));
    }
    const caps=await this.capabilities();
    if(!caps.connected||!caps.pageIds.includes(pageId))throw new Error("COMMENTS_AUTH_REQUIRED");
    if(!caps.read)throw new Error("COMMENTS_READ_UNAVAILABLE");
    const result=unwrap(contentJson((await callTool("get_data",{connector:"facebook_organic",accounts:[pageId],fields:COMMENT_FIELDS,date_from:from,date_to:to})).payload.result)) as {status?:string;data?:Array<Record<string,unknown>>};
    if(result.status==="pending")throw new Error("COMMENTS_READ_PENDING");
    if(!Array.isArray(result.data))throw new Error("COMMENTS_READ_FAILED");
    return result.data.flatMap(row=>{
      const time=new Date(String(row.comment_timestamp));
      if(!row.comment_id||Number.isNaN(time.getTime()))return [];
      return [{id:String(row.comment_id),pageId,postId:row.post_id?String(row.post_id):null,parentId:row.comment_parent_id?String(row.comment_parent_id):null,message:String(row.comment_text??""),createdTime:time,hidden:row.comment_is_hidden===true||row.comment_is_hidden==="true",authorId:null,authorName:null,authorAvatar:null,permalink:null}];
    });
  }
  async getComment(pageId:string,id:string,from:string,to:string){return (await this.listPostComments(pageId,from,to)).find(c=>c.id===id)??null;}
  async getReplies(pageId:string,id:string,from:string,to:string){return (await this.listPostComments(pageId,from,to)).filter(c=>c.parentId===id);}
  async replyToComment(pageId:string,commentId:string,content:string):Promise<{id:string}>{if(!(await storedPageToken(pageId))&&!isGraphConfigured())throw new Error("COMMENTS_REPLY_UNAVAILABLE");return replyToCommentGraph(pageId,commentId,content);}
  async hideComment(pageId:string,commentId:string):Promise<void>{if(!(await storedPageToken(pageId))&&!isGraphConfigured())throw new Error("COMMENTS_HIDE_UNAVAILABLE");await setCommentHiddenGraph(pageId,commentId,true);}
  async unhideComment(pageId:string,commentId:string):Promise<void>{if(!(await storedPageToken(pageId))&&!isGraphConfigured())throw new Error("COMMENTS_HIDE_UNAVAILABLE");await setCommentHiddenGraph(pageId,commentId,false);}
  async markHandled():Promise<void>{throw new Error("COMMENTS_INTERNAL_ACTION_ONLY");}
}
export const commentsProvider=new WindsorFacebookCommentsProvider();

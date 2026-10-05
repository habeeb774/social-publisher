export type ReplyStyle="suggest"|"improve"|"shorten"|"friendly"|"formal"|"saudi";
export interface CommentsReplyAssistant {suggest(input:{comment:string;draft:string;style:ReplyStyle}):Promise<{content:string;provider:string}>;}
/** Optional future dependency. No fake AI text and no automatic sending. */
export class DisabledCommentsReplyAssistant implements CommentsReplyAssistant {
 async suggest():Promise<{content:string;provider:string}>{throw new Error("COMMENT_AI_PROVIDER_NOT_CONFIGURED");}
}

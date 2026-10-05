export type CommentRole="admin"|"editor"|"viewer";
export function canComment(role:CommentRole,action:string){if(role==="admin")return true;if(["read","save_view","read_notifications"].includes(action))return true;return role==="editor"&&["draft","send","ai_suggest"].includes(action);}

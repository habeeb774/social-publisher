import { AsyncLocalStorage } from "node:async_hooks";
const context=new AsyncLocalStorage<string>();
export const commentsActor=()=>context.getStore()??process.env.ADMIN_EMAIL??"system";
export const withCommentsActor=<T>(actor:string,fn:()=>Promise<T>)=>context.run(actor,fn);

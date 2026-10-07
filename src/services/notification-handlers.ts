import { NextRequest,NextResponse } from "next/server";
import type { SQL } from "drizzle-orm";
import { notificationScope } from "./notification-access";
type User={id:string;role:string};
type Dependencies={
  authorize:(request:NextRequest,write:boolean)=>Promise<Response|null>;
  user:(request:NextRequest)=>Promise<User|null>;
  list:(scope:SQL)=>Promise<unknown[]>;
  unread:(scope:SQL)=>Promise<number>;
  markRead:(scope:SQL)=>Promise<void>;
};
export function createNotificationHandlers(dependencies:Dependencies){
  async function run(request:NextRequest,write:boolean){
    try{
      const denied=await dependencies.authorize(request,write);if(denied)return denied;
      const user=await dependencies.user(request);if(!user)return NextResponse.json({error:"يرجى تسجيل الدخول"},{status:401});
      const scope=notificationScope(user);
      if(write){await dependencies.markRead(scope);return NextResponse.json({ok:true});}
      const [items,unread]=await Promise.all([dependencies.list(scope),dependencies.unread(scope)]);
      return NextResponse.json({items,unread},{headers:{"Cache-Control":"private, no-store"}});
    }catch{console.error("Notification operation unavailable",{code:"NOTIFICATIONS_UNAVAILABLE"});return NextResponse.json({error:write?"تعذر تحديث الإشعارات. حاول مجددًا.":"تعذر تحميل الإشعارات. حاول مجددًا."},{status:503});}
  }
  return {GET:(request:NextRequest)=>run(request,false),POST:(request:NextRequest)=>run(request,true)};
}

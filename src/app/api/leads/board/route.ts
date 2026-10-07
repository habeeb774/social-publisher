import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { currentUser,can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { LEAD_STAGES } from "@/services/leads-stages";
import { decodeLeadCursor } from "@/services/leads-filters";
import { readLeadBoard } from "@/services/leads-board-data";
import { LEAD_OWNERSHIP } from "@/services/leads-ownership";
const filters=z.object({status:z.enum(LEAD_STAGES),q:z.string().trim().max(100),cursor:z.string().max(300),ownership:z.enum(LEAD_OWNERSHIP)});
export async function GET(request:NextRequest){
  const denied=await guard(request,false,"leads.read");if(denied)return denied;
  const parsed=filters.safeParse({status:request.nextUrl.searchParams.get("status"),q:request.nextUrl.searchParams.get("q")??"",cursor:request.nextUrl.searchParams.get("cursor")??"",ownership:request.nextUrl.searchParams.get("ownership")??"all"});
  if(!parsed.success)return NextResponse.json({error:"مرشحات البحث غير صالحة"},{status:400});
  let cursor;try{cursor=decodeLeadCursor(parsed.data.cursor);}catch{return NextResponse.json({error:"رابط الصفحة غير صالح"},{status:400});}
  try{
    const user=await currentUser(request);if(!user||!can(user.role,"leads.read"))return NextResponse.json({error:"ليست لديك صلاحية لعرض العملاء"},{status:403});
    const board=await readLeadBoard(await allowedPageIds(user),parsed.data.q,parsed.data.status,cursor,parsed.data.ownership,user.id);
    return NextResponse.json(board[parsed.data.status],{headers:{"Cache-Control":"private, no-store"}});
  }catch{console.error("Lead board unavailable",{code:"LEAD_BOARD_FAILED"});return NextResponse.json({error:"تعذر تحميل العملاء. حاول مجددًا."},{status:503});}
}

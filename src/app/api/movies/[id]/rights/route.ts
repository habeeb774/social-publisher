import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {guard} from "@/services/api-guard";
import {currentUser} from "@/services/rbac";
import {allowedPageIds} from "@/services/access-scope";
import {getDb} from "@/db";
import {rightsReviewSchema,rightsReviewQuery} from "@/services/movie-reels/rights-review";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const denied=await guard(request,true,"content.review");if(denied)return denied;
  if(process.env.MOVIE_REELS_ENABLED!=="true")return NextResponse.json({error:"قسم الأفلام غير مفعّل"},{status:503});
  const {id}=await params;if(!z.uuid().safeParse(id).success)return NextResponse.json({error:"فيلم غير صالح"},{status:400});
  try {
    const parsed=rightsReviewSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"سجّل القرار وسبب المراجعة وتأكيد فحص الدليل"},{status:400});
    const user=await currentUser(request);
    if(!user||!z.uuid().safeParse(user.id).success)return NextResponse.json({error:"استخدم حساب مراجع مسجّل في قاعدة البيانات"},{status:403});
    const result=await getDb().execute(rightsReviewQuery({movieId:id,reviewerId:user.id,allowedPages:await allowedPageIds(user),review:parsed.data}));
    if(!result.rows.length)return NextResponse.json({error:"تعذر اعتماد القرار: الفيلم تغيّر أو الحقوق غير مكتملة أو الصفحة غير متاحة"},{status:409});
    return NextResponse.json({movie:result.rows[0]});
  } catch(error){
    if(error instanceof SyntaxError)return NextResponse.json({error:"طلب غير صالح"},{status:400});
    console.error("Movie rights review unavailable",{code:"MOVIE_RIGHTS_REVIEW_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر حفظ مراجعة الحقوق"},{status:503});
  }
}

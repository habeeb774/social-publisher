import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { movieAssets } from "@/db/movie-schema";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";
import { facebookPages } from "@/db/schema";
import { allowedPageIds } from "@/services/access-scope";
import { createMovieSchema, movieDraft } from "@/services/movie-reels/input";

export async function POST(request: NextRequest) {
  const denied=await guard(request,true,"content.write");
  if(denied) return denied;
  if(process.env.MOVIE_REELS_ENABLED!=="true") return NextResponse.json({error:"قسم الأفلام غير مفعّل بعد"},{status:503});
  // Metadata only: originals must upload straight to private cloud storage.
  if(!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({error:"هذه الواجهة تستقبل بيانات الفيلم فقط، وليس ملف الفيديو"},{status:415});
  if(Number(request.headers.get("content-length"))>16000) return NextResponse.json({error:"الطلب أكبر من الحد المسموح"},{status:413});
  try {
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>16000) return NextResponse.json({error:"الطلب أكبر من الحد المسموح"},{status:413});
    const parsed=createMovieSchema.safeParse(JSON.parse(raw));
    if(!parsed.success) return NextResponse.json({error:"تحقق من عنوان الفيلم والصفحة وبيانات الترخيص والإقرار"},{status:400});
    const user=await currentUser(request);
    if(!user) return NextResponse.json({error:"يرجى تسجيل الدخول"},{status:401});
    const draft=movieDraft(parsed.data,user.id);
    const allowed=await allowedPageIds(user);
    if(allowed!==null&&!allowed.has(parsed.data.pageId)) return NextResponse.json({error:"الصفحة غير متاحة لحسابك"},{status:403});
    const db=getDb();
    const [page]=await db.select({id:facebookPages.id}).from(facebookPages).where(and(eq(facebookPages.id,parsed.data.pageId),eq(facebookPages.isActive,true),eq(facebookPages.platform,"facebook"))).limit(1);
    if(!page) return NextResponse.json({error:"اختر صفحة Facebook نشطة"},{status:400});
    const [movie]=await db.insert(movieAssets).values(draft).returning({id:movieAssets.id,title:movieAssets.title,status:movieAssets.status,rightsStatus:movieAssets.rightsStatus});
    return NextResponse.json(movie,{status:201});
  } catch(error) {
    if(error instanceof SyntaxError) return NextResponse.json({error:"بيانات الطلب غير صالحة"},{status:400});
    if(error instanceof Error&&error.message==="MOVIE_USER_ACCOUNT_REQUIRED") return NextResponse.json({error:"استخدم حساب فريق مسجّل في النظام لحفظ ملكية الفيلم"},{status:403});
    if(error instanceof Error&&error.message==="MOVIE_LICENSE_EXPIRED") return NextResponse.json({error:"الترخيص منتهي الصلاحية"},{status:400});
    console.error("Movie creation unavailable",{code:"MOVIE_CREATE_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر تسجيل الفيلم. تحقق من تجهيز قاعدة بيانات القسم."},{status:503});
  }
}

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "content.read");
  if (denied) return denied;
  if (process.env.MOVIE_REELS_ENABLED !== "true") return NextResponse.json({enabled:false,items:[]});
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({error:"يرجى تسجيل الدخول"},{status:401});
    // Private originals/evidence/storage keys are never returned by the list API.
    const items = await getDb().select({id:movieAssets.id,title:movieAssets.title,status:movieAssets.status,rightsStatus:movieAssets.rightsStatus,createdAt:movieAssets.createdAt,updatedAt:movieAssets.updatedAt}).from(movieAssets)
      .where(user.role === "admin" ? undefined : eq(movieAssets.ownerUserId,user.id)).orderBy(desc(movieAssets.createdAt)).limit(100);
    return NextResponse.json({enabled:true,items});
  } catch {
    console.error("Movie list unavailable",{code:"MOVIE_DATABASE_UNAVAILABLE"});
    return NextResponse.json({error:"تعذر تحميل الأفلام. تحقق من تجهيز قاعدة بيانات القسم.",code:"MOVIE_DATABASE_UNAVAILABLE"},{status:503});
  }
}

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { movieAssets } from "@/db/movie-schema";
import { guard } from "@/services/api-guard";
import { currentUser } from "@/services/rbac";

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

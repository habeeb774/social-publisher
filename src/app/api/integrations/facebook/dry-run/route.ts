import { isPublishingEnabled } from "@/services/publishing-mode";
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/services/request-auth";
import { publishDuePosts } from "@/services/publisher";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (isPublishingEnabled()) return NextResponse.json({error:"SAFE_MODE_REQUIRED"},{status:409});
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return NextResponse.json({error:"Invalid origin"},{status:403});
  try {
    const results = await publishDuePosts();
    return NextResponse.json({safeMode:true,results});
  } catch { return NextResponse.json({error:"DRY_RUN_FAILED"},{status:500}); }
}

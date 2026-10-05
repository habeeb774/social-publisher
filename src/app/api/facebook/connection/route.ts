import { NextRequest, NextResponse } from "next/server";
import { testFacebookConnection } from "@/services/facebook";
import { guard } from "@/services/api-guard";
export async function POST(request: NextRequest){{const denied=await guard(request,request.method!=="GET","system.diagnose");if(denied)return denied;}try{const page=await testFacebookConnection();return NextResponse.json({connected:true,page});}catch(error){return NextResponse.json({connected:false,error:error instanceof Error?error.message:"تعذر اختبار الاتصال"},{status:502});}}

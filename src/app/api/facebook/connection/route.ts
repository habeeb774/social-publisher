import { NextResponse } from "next/server";
import { testFacebookConnection } from "@/services/facebook";
export async function POST(){try{const page=await testFacebookConnection();return NextResponse.json({connected:true,page});}catch(error){return NextResponse.json({connected:false,error:error instanceof Error?error.message:"تعذر اختبار الاتصال"},{status:502});}}

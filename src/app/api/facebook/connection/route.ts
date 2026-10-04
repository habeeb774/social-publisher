import { NextRequest, NextResponse } from "next/server";
import { testFacebookConnection } from "@/services/facebook";
import { isAdminRequest } from "@/services/request-auth";
export async function POST(request: NextRequest){if(!isAdminRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});try{const page=await testFacebookConnection();return NextResponse.json({connected:true,page});}catch(error){return NextResponse.json({connected:false,error:error instanceof Error?error.message:"تعذر اختبار الاتصال"},{status:502});}}

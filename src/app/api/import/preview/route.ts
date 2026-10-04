import { NextRequest, NextResponse } from "next/server";
import { previewWorkbook } from "@/services/import";
import { isAdminRequest } from "@/services/request-auth";
export async function POST(request: NextRequest){if(!(await isAdminRequest(request)))return NextResponse.json({error:"Unauthorized"},{status:401});try{const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"الملف مطلوب"},{status:400});if(file.size>10*1024*1024)return NextResponse.json({error:"حجم الملف أكبر من 10MB"},{status:413});const report=previewWorkbook(await file.arrayBuffer());return NextResponse.json(report);}catch{return NextResponse.json({error:"تعذر قراءة ملف Excel"},{status:400});}}

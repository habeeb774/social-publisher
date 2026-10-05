import { NextRequest, NextResponse } from "next/server";
import { previewWorkbook } from "@/services/import";
import { guard } from "@/services/api-guard";
export async function POST(request: NextRequest){{const denied=await guard(request,request.method!=="GET","content.write");if(denied)return denied;}try{const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:"الملف مطلوب"},{status:400});if(file.size>10*1024*1024)return NextResponse.json({error:"حجم الملف أكبر من 10MB"},{status:413});const report=previewWorkbook(await file.arrayBuffer());return NextResponse.json(report);}catch{return NextResponse.json({error:"تعذر قراءة ملف Excel"},{status:400});}}

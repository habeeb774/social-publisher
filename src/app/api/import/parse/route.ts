import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { IMPORT_FIELDS, parseSheet, suggestMapping } from "@/services/import";

/** Step 1: read the file and suggest a column mapping. Nothing is saved. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "حجم الملف أكبر من 10MB" }, { status: 413 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return NextResponse.json({ error: "الصيغ المدعومة: XLSX, XLS, CSV" }, { status: 400 });
    const parsed = parseSheet(await file.arrayBuffer());
    if (!parsed.rows.length) return NextResponse.json({ error: "الملف لا يحتوي صفوفًا" }, { status: 400 });
    return NextResponse.json({ ...parsed, mapping: suggestMapping(parsed.headers), fields: Object.entries(IMPORT_FIELDS).map(([key, f]) => ({ key, label: f.label, required: f.required })) });
  } catch { return NextResponse.json({ error: "تعذر قراءة الملف" }, { status: 400 }); }
}

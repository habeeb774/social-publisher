import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "./request-auth";

/** Shared server-side authorization for every new API route: session check, plus same-origin for writes. */
export async function guard(request: NextRequest, write = request.method !== "GET") {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (write && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  return null;
}

export const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

const messages: Record<string, [string, number]> = {
  NOT_FOUND: ["العنصر غير موجود", 404],
  NOT_EDITABLE: ["حالة المنشور لا تسمح بهذا الإجراء", 409],
  NOT_PENDING: ["المنشور ليس بانتظار الموافقة", 409],
  NO_SLOTS: ["أضف أوقات نشر للطابور أولًا", 409],
  PAGE_REQUIRED: ["اختر صفحة", 400],
  PAGE_UNAVAILABLE: ["الصفحة غير متاحة", 409],
  STORAGE_NOT_CONFIGURED: ["لم يتم إعداد التخزين؛ أضف الصورة برابط مباشر", 503],
};
export function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = messages[code];
  if (known) return NextResponse.json({ error: known[0], code }, { status: known[1] });
  console.error("API error", { error: code });
  return NextResponse.json({ error: "تعذر تنفيذ العملية" }, { status: 500 });
}

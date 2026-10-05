import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "./request-auth";
import { can, type Permission } from "./rbac";
import { bindActor } from "./audit";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Shared server-side authorization: signed session, role permission, and same-origin for writes.
 * Default permission is content.read for GET and content.write for mutations.
 */
export async function guard(request: NextRequest, write = request.method !== "GET", permission?: Permission) {
  const session = await sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.role, permission ?? (write ? "content.write" : "content.read"))) return NextResponse.json({ error: "ليست لديك صلاحية لهذا الإجراء", code: "FORBIDDEN" }, { status: 403 });
  if (write && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  // Attribute audit entries and versions to the signed-in user.
  if (session.userId === "env-admin") bindActor(process.env.ADMIN_EMAIL?.trim() || "admin");
  else { const [u] = await getDb().select({ email: users.email, active: users.isActive }).from(users).where(eq(users.id, session.userId)).limit(1).catch(() => []); if (!u?.active) return NextResponse.json({ error: "الحساب معطل" }, { status: 401 }); bindActor(u.email); }
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

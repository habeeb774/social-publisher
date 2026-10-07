import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom, type Session } from "./request-auth";
import { can, currentUser, type CurrentUser, type Permission } from "./rbac";
import { bindActor } from "./audit";

/**
 * Shared server-side authorization: signed session, role permission, and same-origin for writes.
 * Default permission is content.read for GET and content.write for mutations.
 */
type GuardDependencies = {
  readSession: (request: NextRequest) => Promise<Session | null>;
  readUser: (request: NextRequest) => Promise<CurrentUser | null>;
  bindActor: (email: string) => void;
};

/** Dependency boundary allows testing the actual request guard without production credentials. */
export function createGuard(dependencies: GuardDependencies) {
  return async (request: NextRequest, write = request.method !== "GET", permission?: Permission) => {
    try {
      const session = await dependencies.readSession(request);
      if (!session) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
      if (write && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "مصدر الطلب غير مسموح" }, { status: 403 });
      // Never authorize a historical role from a still-valid cookie after a downgrade.
      const user = await dependencies.readUser(request);
      if (!user || user.id !== session.userId) return NextResponse.json({ error: "الحساب غير متاح. يرجى تسجيل الدخول مجددًا." }, { status: 401 });
      if (!can(user.role, permission ?? (write ? "content.write" : "content.read"))) return NextResponse.json({ error: "ليست لديك صلاحية لهذا الإجراء", code: "FORBIDDEN" }, { status: 403 });
      dependencies.bindActor(user.email || "admin");
      return null;
    } catch {
      console.error("Authorization check unavailable", { code: "AUTHORIZATION_UNAVAILABLE" });
      return NextResponse.json({ error: "تعذر التحقق من الصلاحيات. حاول لاحقًا.", code: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
    }
  };
}

export const guard = createGuard({ readSession: sessionFrom, readUser: currentUser, bindActor });

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

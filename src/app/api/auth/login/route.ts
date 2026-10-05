import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { logAudit } from "@/services/audit";
import { safeEqualText, verifyPassword } from "@/services/passwords";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, type Role } from "@/services/request-auth";

const fail = (request: Request, message: string, status: number) =>
  request.headers.get("accept")?.includes("application/json") ? NextResponse.json({ error: message }, { status }) : NextResponse.redirect(new URL(`/login?error=${status === 401 ? "invalid" : "config"}`, request.url), 303);

/**
 * Bootstrap admin (ADMIN_EMAIL / ADMIN_PASSWORD) or a user row with a scrypt password hash.
 * The role is signed into the session cookie; disabled users cannot sign in.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const password = String(form?.get("password") ?? "");
  if (!email || !password) return fail(request, "أدخل البريد وكلمة المرور", 401);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase(), adminPassword = process.env.ADMIN_PASSWORD;
  let session: { userId: string; role: Role } | null = null;
  if (adminEmail && adminPassword && safeEqualText(email, adminEmail) && safeEqualText(password, adminPassword)) session = { userId: "env-admin", role: "admin" };
  else {
    try {
      const [row] = await getDb().select().from(users).where(eq(sql`lower(${users.email})`, email)).limit(1);
      if (row?.isActive && await verifyPassword(password, row.passwordHash)) {
        session = { userId: row.id, role: row.role as Role };
        await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
      } else if (!row) await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="); // equalize timing
    } catch { if (!adminEmail) return fail(request, "لم يتم إعداد بيانات الدخول", 503); }
  }
  if (!session) return fail(request, "بيانات الدخول غير صحيحة", 401);
  await logAudit("auth.login", "user", session.userId === "env-admin" ? null : session.userId, { role: session.role });
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  return response;
}

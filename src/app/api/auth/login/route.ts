import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, users } from "@/db/schema";
import { createHash } from "node:crypto";
import { logAudit } from "@/services/audit";
import { safeEqualText, verifyPassword } from "@/services/passwords";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, type Role } from "@/services/request-auth";

const fail = (request: Request, message: string, status: number) =>
  request.headers.get("accept")?.includes("application/json") ? NextResponse.json({ error: message }, { status }) : NextResponse.redirect(new URL(`/login?error=${status === 401 ? "invalid" : status === 429 ? "locked" : "config"}`, request.url), 303);

/**
 * Bootstrap admin (ADMIN_EMAIL / ADMIN_PASSWORD) or a user row with a scrypt password hash.
 * The role is signed into the session cookie; disabled users cannot sign in.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase();
  const password = String(form?.get("password") ?? "");
  if (!email || !password) return fail(request, "أدخل البريد وكلمة المرور", 401);
  // Brute-force protection: at most 8 failed attempts per address and per IP in 15 minutes.
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 32);
  const who = { email: hash(email), ip: hash(ip) };
  const recent = await getDb().select({ n: sql<number>`count(*)::int` }).from(activityLogs)
    .where(and(eq(activityLogs.action, "auth.failed"), gt(activityLogs.createdAt, new Date(Date.now() - 15 * 60000)), sql`(${activityLogs.metadata}->>'email' = ${who.email} or ${activityLogs.metadata}->>'ip' = ${who.ip})`))
    .then((r) => r[0]?.n ?? 0).catch(() => 0);
  if (recent >= 8) return fail(request, "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا", 429);
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
  if (!session) {
    await logAudit("auth.failed", "user", null, who).catch(() => {});
    return fail(request, "بيانات الدخول غير صحيحة", 401);
  }
  await logAudit("auth.login", "user", session.userId === "env-admin" ? null : session.userId, { role: session.role });
  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(SESSION_COOKIE, await createSessionToken(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  return response;
}

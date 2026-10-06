import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { hashPassword, passwordPolicy } from "@/services/passwords";
import { ROLES } from "@/services/request-auth";
import { getUserAccessScope, setUserAccessScope } from "@/services/access-scope";

const publicUser = { id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt };

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "users.manage"); if (denied) return denied;
  const rows = await getDb().select(publicUser).from(users).orderBy(asc(users.createdAt)).limit(200);
  return NextResponse.json(await Promise.all(rows.map(async (row) => ({ ...row, scope: await getUserAccessScope(row.id) }))));
}

const createBody = z.object({ email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().min(1).max(80), role: z.enum(ROLES), password: z.string().min(1).max(200) });
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "users.manage"); if (denied) return denied;
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const policy = passwordPolicy(parsed.data.password); if (policy) return NextResponse.json({ error: policy }, { status: 400 });
  if (parsed.data.email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) return NextResponse.json({ error: "هذا البريد هو حساب المدير الأساسي" }, { status: 409 });
  const db = getDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, parsed.data.email)).limit(1);
  if (exists) return NextResponse.json({ error: "البريد مستخدم" }, { status: 409 });
  const [row] = await db.insert(users).values({ email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, passwordHash: await hashPassword(parsed.data.password) }).returning(publicUser);
  await logAudit("user.created", "user", row.id, { role: row.role });
  return NextResponse.json(row, { status: 201 });
}

const patchBody = z.object({ id: z.uuid(), role: z.enum(ROLES).optional(), isActive: z.boolean().optional(), name: z.string().trim().min(1).max(80).optional(), password: z.string().max(200).optional(), scope: z.object({ unrestricted: z.boolean(), accountIds: z.array(z.string().trim().min(1).max(200)).max(100), pageIds: z.array(z.uuid()).max(500) }).optional() });
/** Role/status changes apply at the user's next sign-in; disabling blocks API access immediately. */
export async function PATCH(request: NextRequest) {
  const denied = await guard(request, true, "users.manage"); if (denied) return denied;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.id)) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const { id, password, scope, ...rest } = parsed.data;
  if (password) { const policy = passwordPolicy(password); if (policy) return NextResponse.json({ error: policy }, { status: 400 }); }
  const [row] = await getDb().update(users).set({ ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}), updatedAt: new Date() }).where(eq(users.id, id)).returning(publicUser);
  if (!row) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  const savedScope = scope ? await setUserAccessScope(id, scope) : await getUserAccessScope(id);
  await logAudit("user.updated", "user", id, { ...rest, scopeChanged: Boolean(scope), passwordChanged: Boolean(password) });
  return NextResponse.json({ ...row, scope: savedScope });
}

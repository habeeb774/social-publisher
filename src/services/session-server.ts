import { cookies } from "next/headers";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { can, type Permission } from "./rbac";
import { readSession, ROLES, SESSION_COOKIE, type Role } from "./request-auth";

/** Session for server components (pages). Use to hide controls the role cannot use; APIs still enforce. */
export const pageSession = cache(async () => {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.userId === "env-admin") return session;
  try {
    const [user] = await getDb().select({ role: users.role, active: users.isActive }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user?.active || !ROLES.includes(user.role as Role)) return null;
    return { userId: session.userId, role: user.role as Role };
  } catch {
    console.error("Page authorization unavailable", { code: "AUTHORIZATION_UNAVAILABLE" });
    return null;
  }
});
export async function pageCan(permission: Permission) {
  return can((await pageSession())?.role, permission);
}

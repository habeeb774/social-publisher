import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sessionFrom, type Role } from "./request-auth";

export const ROLE_LABELS: Record<Role, string> = { admin: "مدير", editor: "محرر", reviewer: "مراجع", viewer: "مشاهد" };

/**
 * Permission matrix. Server routes must call can()/requirePermission(); hiding a button is never enough.
 *  admin    — everything
 *  editor   — create/edit content, manual inbox replies
 *  reviewer — approve/reject, read everything
 *  viewer   — read only
 */
export const PERMISSIONS = {
  "content.read": ["admin", "editor", "reviewer", "viewer"],
  "content.write": ["admin", "editor"],
  "content.publish": ["admin", "editor"],
  "content.review": ["admin", "reviewer"],
  "inbox.reply": ["admin", "editor"],
  "inbox.manage": ["admin", "editor"],
  "leads.read": ["admin", "editor", "reviewer", "viewer"],
  "leads.create": ["admin", "editor"],
  "automation.manage": ["admin"],
  "settings.manage": ["admin"],
  "users.manage": ["admin"],
  "data.export": ["admin"],
  "system.diagnose": ["admin", "editor"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role | undefined | null, permission: Permission) => Boolean(role && (PERMISSIONS[permission] as readonly Role[]).includes(role));

export type CurrentUser = { id: string; email: string; name: string; role: Role };
export async function currentUser(request: NextRequest): Promise<CurrentUser | null> {
  const session = await sessionFrom(request);
  if (!session) return null;
  if (session.userId === "env-admin") return { id: "env-admin", email: process.env.ADMIN_EMAIL ?? "", name: process.env.ADMIN_NAME?.trim() || "م. حبيب", role: "admin" };
  const [row] = await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!row || row.isActive === false) return null;
  return { id: row.id, email: row.email, name: row.name || row.email, role: (row.role as Role) ?? session.role };
}

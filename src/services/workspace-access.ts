import { sql } from "drizzle-orm";
import { z } from "zod";

export const WORKSPACE_ROLES = ["owner", "admin", "manager", "editor", "publisher", "support", "viewer"] as const;
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];
const reads = WORKSPACE_ROLES;
const managers = ["owner", "admin", "manager"] as const;
export const WORKSPACE_PERMISSIONS = {
  "posts.read": reads,
  "posts.create": ["owner", "admin", "manager", "editor"],
  "posts.edit": ["owner", "admin", "manager", "editor"],
  "posts.delete": managers,
  "posts.publish": ["owner", "admin", "manager", "publisher"],
  "posts.approve": managers,
  "comments.read": reads,
  "comments.reply": ["owner", "admin", "manager", "support"],
  "comments.manage": ["owner", "admin", "manager", "support"],
  "messages.read": reads,
  "messages.reply": ["owner", "admin", "manager", "support"],
  "leads.read": reads,
  "leads.create": ["owner", "admin", "manager", "support"],
  "leads.edit": ["owner", "admin", "manager", "support"],
  "leads.assign": managers,
  "analytics.read": reads,
  "settings.manage": ["owner", "admin"],
  "team.manage": ["owner", "admin"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;
export type WorkspacePermission = keyof typeof WORKSPACE_PERMISSIONS;

export function workspaceCan(role: unknown, permission: WorkspacePermission): boolean {
  return typeof role === "string" && (WORKSPACE_PERMISSIONS[permission] as readonly string[]).includes(role);
}

const identifier = z.string().uuid();
function identifiers(userId: string, workspaceId: string) {
  identifier.parse(userId);
  identifier.parse(workspaceId);
}

/** Database membership, never the global role or a workspace ID supplied by the browser, grants access. */
export function workspaceMembershipQuery(userId: string, workspaceId: string) {
  identifiers(userId, workspaceId);
  return sql`SELECT m.workspace_id, m.role FROM workspace_members m
    JOIN workspaces w ON w.id=m.workspace_id AND w.is_active=true
    JOIN users u ON u.id=m.user_id AND u.is_active=true
    WHERE m.user_id=${userId}::uuid AND m.workspace_id=${workspaceId}::uuid AND m.is_active=true`;
}

/** Empty results mean no pages, not unrestricted access. Rechecks membership on every query. */
export function workspacePagesQuery(userId: string, workspaceId: string) {
  identifiers(userId, workspaceId);
  return sql`SELECT p.id FROM workspace_pages wp
    JOIN facebook_pages p ON p.id=wp.page_id AND p.is_active=true
    JOIN workspaces w ON w.id=wp.workspace_id AND w.is_active=true
    JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=${userId}::uuid AND m.is_active=true
    JOIN users u ON u.id=m.user_id AND u.is_active=true
    WHERE wp.workspace_id=${workspaceId}::uuid ORDER BY p.id`;
}

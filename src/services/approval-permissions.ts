import type { Permission } from "./rbac";

export type ApprovalAction = "submit" | "approve" | "reject" | "changes";

/** Authoring and review are distinct; authorize against the current database role. */
export function approvalActionPermission(action: ApprovalAction): Permission {
  return action === "submit" ? "content.write" : "content.review";
}

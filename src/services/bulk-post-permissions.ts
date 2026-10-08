import type { WorkspacePermission } from "./workspace-access";

export type BulkPostAction = "schedule" | "to_draft" | "unschedule" | "archive" | "delete_drafts" | "change_page" | "assign_campaign";

/** Scheduling authorizes publishing; destructive actions require deletion authority. */
export function bulkPostPermissions(action: BulkPostAction): readonly [WorkspacePermission, ...WorkspacePermission[]] {
  switch (action) {
    case "schedule": return ["posts.edit", "posts.publish"];
    case "archive":
    case "delete_drafts": return ["posts.delete"];
    case "to_draft":
    case "unschedule":
    case "change_page":
    case "assign_campaign": return ["posts.edit"];
  }
}

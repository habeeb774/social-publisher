import { getDb } from "@/db";
import { currentUser } from "@/services/rbac";
import { workspaceMembershipQuery } from "@/services/workspace-access";
import { createWorkspaceAccessHandler } from "@/services/workspace-request";

export const GET = createWorkspaceAccessHandler({
  user:currentUser,
  membership:async (userId,workspaceId) => (await getDb().execute(workspaceMembershipQuery(userId,workspaceId))).rows,
});

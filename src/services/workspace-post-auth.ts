import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../db";
import { currentUser } from "./rbac";
import { authorizeWorkspace } from "./workspace-request";
import { workspaceCan, workspaceMembershipQuery, type WorkspacePermission } from "./workspace-access";
import { workspacePostPermissionPredicate } from "./workspace-posts";

/** Additional transition guard; legacy authorization remains mandatory until cutover. */
export async function workspacePostMutationAccess(request:NextRequest,permissions:readonly [WorkspacePermission,...WorkspacePermission[]]) {
  const id=request.nextUrl.searchParams.get("workspace");
  if(id===null && process.env.WORKSPACE_ISOLATION_ENABLED!=="true")return {};
  const access=await authorizeWorkspace(request,id??"",{
    user:currentUser,
    membership:async(userId,workspaceId)=>(await getDb().execute(workspaceMembershipQuery(userId,workspaceId))).rows,
  },permissions[0]);
  if(access.response)return {response:access.response};
  if(permissions.some(permission=>!workspaceCan(access.context.role,permission)))return {response:NextResponse.json({error:"ليست لديك صلاحية لهذا الإجراء."},{status:403,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}})};
  return {context:access.context,predicate:workspacePostPermissionPredicate(access.context,permissions)};
}

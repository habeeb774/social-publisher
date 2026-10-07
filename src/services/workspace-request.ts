import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WORKSPACE_PERMISSIONS, WORKSPACE_ROLES, workspaceCan, type WorkspacePermission, type WorkspaceRole } from "./workspace-access";

export type WorkspaceContext = { userId: string; workspaceId: string; role: WorkspaceRole };
export type WorkspaceRequestDependencies = {
  user: (request: NextRequest) => Promise<{id:string} | null>;
  membership: (userId:string, workspaceId:string) => Promise<unknown>;
};
const identifier = z.string().uuid();
const membershipSchema = z.array(z.object({workspace_id:identifier, role:z.enum(WORKSPACE_ROLES)})).max(1);
const headers = {"Cache-Control":"private, no-store", Vary:"Cookie"};
const deny = (status:number, code:string, error:string) => NextResponse.json({code,error},{status,headers});

/** Request-scoped only. Mutations must also enforce current membership inside their SQL statement. */
export async function authorizeWorkspace(
  request: NextRequest,
  workspaceId: string,
  dependencies: WorkspaceRequestDependencies,
  permission?: WorkspacePermission,
): Promise<{context:WorkspaceContext; response?:never} | {response:NextResponse; context?:never}> {
  try {
    const user = await dependencies.user(request);
    if (!user) return {response:deny(401,"AUTHENTICATION_REQUIRED","يرجى تسجيل الدخول.")};
    if (!identifier.safeParse(workspaceId).success) return {response:deny(400,"INVALID_WORKSPACE","مساحة العمل المطلوبة غير صالحة.")};
    // No global-role or bootstrap administrator bypass into a tenant.
    if (!identifier.safeParse(user.id).success) return {response:deny(403,"WORKSPACE_FORBIDDEN","مساحة العمل غير متاحة لك.")};
    const result = membershipSchema.safeParse(await dependencies.membership(user.id,workspaceId));
    if (!result.success) throw new Error("INVALID_MEMBERSHIP_RESULT");
    const membership = result.data[0];
    if (!membership || membership.workspace_id !== workspaceId || (permission && !workspaceCan(membership.role,permission))) {
      return {response:deny(403,"WORKSPACE_FORBIDDEN","مساحة العمل أو الإجراء غير متاح لك.")};
    }
    return {context:{userId:user.id,workspaceId,role:membership.role}};
  } catch {
    console.error("Workspace authorization unavailable",{code:"WORKSPACE_AUTHORIZATION_UNAVAILABLE"});
    return {response:deny(503,"WORKSPACE_AUTHORIZATION_UNAVAILABLE","تعذر التحقق من صلاحيات مساحة العمل. حاول لاحقًا.")};
  }
}

export function createWorkspaceAccessHandler(dependencies:WorkspaceRequestDependencies) {
  return async (request:NextRequest, route:{params:Promise<{id:string}>}) => {
    const {id} = await route.params;
    const result = await authorizeWorkspace(request,id,dependencies);
    if (result.response) return result.response;
    const {workspaceId,role} = result.context;
    const permissions = (Object.keys(WORKSPACE_PERMISSIONS) as WorkspacePermission[]).filter(permission => workspaceCan(role,permission));
    return NextResponse.json({workspaceId,role,permissions},{headers});
  };
}

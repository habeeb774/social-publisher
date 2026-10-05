import { cookies } from "next/headers";
import { can, type Permission } from "./rbac";
import { readSession, SESSION_COOKIE } from "./request-auth";

/** Session for server components (pages). Use to hide controls the role cannot use; APIs still enforce. */
export async function pageSession() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function pageCan(permission: Permission) {
  return can((await pageSession())?.role, permission);
}

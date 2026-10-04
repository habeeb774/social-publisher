import { NextRequest } from "next/server";

export function isAdminRequest(request: NextRequest) {
  return request.cookies.get("sp_admin")?.value === "authenticated";
}

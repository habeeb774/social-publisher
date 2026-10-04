import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/services/request-auth";
export async function middleware(request: NextRequest) {
  const path=request.nextUrl.pathname;
  const protectedRoots=["/dashboard","/posts","/calendar","/pages","/import","/settings","/logs"];
  if(protectedRoots.some(root=>path===root||path.startsWith(root+"/")) && !(await isAdminRequest(request))) {
    return NextResponse.redirect(new URL("/login",request.url));
  }
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};

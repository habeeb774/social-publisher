import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/services/request-auth";

// Deny by default: every page needs a session except these. API routes enforce auth themselves
// (they return 401 JSON instead of redirecting), so new pages are protected without listing them.
const PUBLIC = ["/login", "/api/", "/manifest.webmanifest", "/icon", "/robots.txt"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return NextResponse.next();
  if (!(await isAdminRequest(request))) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

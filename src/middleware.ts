import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/services/request-auth";
import { TEAM_COOKIE,verifyTeamToken } from "@/services/comments/team-token";

// Deny by default: every page needs a session except these. API routes enforce auth themselves
// (they return 401 JSON instead of redirecting), so new pages are protected without listing them.
const PUBLIC = ["/login", "/api/", "/s/", "/manifest.webmanifest", "/icon", "/apple-icon", "/robots.txt"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if(path==="/comments/login")return NextResponse.next();
  if(["/inbox","/settings/replies","/analytics/comments","/automations/comments"].includes(path)&&await verifyTeamToken(request.cookies.get(TEAM_COOKIE)?.value))return NextResponse.next();
  // Only the supplied public brand assets are accessible before login.
  if (/^\/brand\/(?:icon-(?:16x16|32x32|48x48|180x180|192x192|512x512)\.png|favicon\.ico)$/.test(path)) return NextResponse.next();
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return NextResponse.next();
  if (!(await isAdminRequest(request))) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

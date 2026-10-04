import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/services/request-auth";
export async function middleware(request: NextRequest){if(request.nextUrl.pathname.startsWith("/api/health")||request.nextUrl.pathname.startsWith("/api/auth")||request.nextUrl.pathname.startsWith("/api/cron"))return NextResponse.next();if(request.nextUrl.pathname.startsWith("/dashboard")||request.nextUrl.pathname.startsWith("/posts")||request.nextUrl.pathname.startsWith("/calendar")||request.nextUrl.pathname.startsWith("/pages")||request.nextUrl.pathname.startsWith("/import")||request.nextUrl.pathname.startsWith("/settings")){if(!(await isAdminRequest(request)))return NextResponse.redirect(new URL("/login",request.url));}return NextResponse.next();}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};

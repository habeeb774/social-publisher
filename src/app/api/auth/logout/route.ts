import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete("sp_admin");
  return response;
}

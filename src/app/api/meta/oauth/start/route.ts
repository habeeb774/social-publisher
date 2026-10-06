import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/services/api-guard";
import { createMetaState, metaAuthorizationUrl, metaOAuthConfigured, metaRedirectUri } from "@/services/meta-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "settings.manage");
  if (denied) return denied;
  if (!metaOAuthConfigured()) {
    return NextResponse.redirect(new URL("/pages?meta=missing-config", request.url));
  }
  const redirectUri = metaRedirectUri(request.nextUrl.origin);
  const state = createMetaState("/pages");
  return NextResponse.redirect(metaAuthorizationUrl(redirectUri, state));
}

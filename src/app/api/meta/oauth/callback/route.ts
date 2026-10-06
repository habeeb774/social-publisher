import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, notifications } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { setSetting } from "@/services/settings-store";
import { setupMetaWebhook } from "@/services/meta-webhook";
import { encryptToken } from "@/services/page-tokens";
import {
  exchangeMetaCode,
  managedMetaPages,
  metaGrantedPermissions,
  metaOAuthConfigured,
  metaUserProfile,
  metaRedirectUri,
  verifyMetaState,
} from "@/services/meta-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const back = (request: NextRequest, params: Record<string, string | number>) => {
  const url = new URL("/pages", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return NextResponse.redirect(url);
};

export async function GET(request: NextRequest) {
  const denied = await guard(request, false, "settings.manage");
  if (denied) return denied;
  if (!metaOAuthConfigured()) return back(request, { meta: "missing-config" });

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return back(request, { meta: "cancelled" });

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || !verifyMetaState(state)) return back(request, { meta: "invalid-state" });

  try {
    const redirectUri = metaRedirectUri(request.nextUrl.origin);
    const userToken = await exchangeMetaCode(code, redirectUri);
    const [pages, permissions, profile] = await Promise.all([
      managedMetaPages(userToken),
      metaGrantedPermissions(userToken).catch(() => [] as string[]),
      metaUserProfile(userToken).catch(() => null),
    ]);

    if (!pages.length) return back(request, { meta: "no-pages" });

    const db = getDb();
    if (profile) {
      await setSetting("meta_connected_profile", {
        id: profile.id,
        name: profile.name,
        pictureUrl: profile.pictureUrl ?? null,
        connectedAt: new Date().toISOString(),
      });
    }
    let connectedPages = 0;
    let connectedInstagram = 0;

    for (const page of pages) {
      const encrypted = encryptToken(page.access_token);
      await db.insert(facebookPages).values({
        name: page.name,
        facebookPageId: page.id,
        platform: "facebook",
        profileUrl: `https://www.facebook.com/${page.id}`,
        accessTokenEnc: encrypted,
        isActive: true,
        status: "active",
        lastConnectionCheck: new Date(),
      }).onConflictDoUpdate({
        target: [facebookPages.platform, facebookPages.facebookPageId],
        set: {
          name: page.name,
          profileUrl: `https://www.facebook.com/${page.id}`,
          accessTokenEnc: encrypted,
          isActive: true,
          status: "active",
          lastConnectionCheck: new Date(),
          updatedAt: new Date(),
        },
      });
      connectedPages++;

      await db.update(notifications).set({ isRead: true }).where(and(
        inArray(notifications.type, ["token_invalid", "token_expiring"]),
        ilike(notifications.title, `%${page.name}%`),
      ));

      const ig = page.instagram_business_account;
      if (ig?.id) {
        const igName = ig.username ? `@${ig.username}` : `Instagram ${ig.id}`;
        await db.insert(facebookPages).values({
          name: igName,
          facebookPageId: ig.id,
          platform: "instagram",
          profileUrl: ig.username ? `https://www.instagram.com/${ig.username}` : null,
          mcpConnectionReference: page.id,
          accessTokenEnc: encrypted,
          isActive: true,
          status: "active",
          lastConnectionCheck: new Date(),
        }).onConflictDoUpdate({
          target: [facebookPages.platform, facebookPages.facebookPageId],
          set: {
            name: igName,
            profileUrl: ig.username ? `https://www.instagram.com/${ig.username}` : null,
            mcpConnectionReference: page.id,
            accessTokenEnc: encrypted,
            isActive: true,
            status: "active",
            lastConnectionCheck: new Date(),
            updatedAt: new Date(),
          },
        });
        connectedInstagram++;
      }
    }

    await logAudit("meta.oauth_connected", "integration", null, {
      pages: connectedPages,
      instagram: connectedInstagram,
      profile: profile ? { id: profile.id, name: profile.name } : null,
      permissions: permissions.filter((p) => p === "public_profile" || p.startsWith("pages_") || p.startsWith("instagram_")),
    });

    const messengerGranted = permissions.includes("pages_messaging");
    let webhook = "pending";
    try {
      const setup = await setupMetaWebhook();
      webhook = setup.pages.some((page) => page.ok) ? "connected" : "partial";
    } catch (error) {
      webhook = "failed";
      console.error("Meta webhook auto-setup failed", { error: error instanceof Error ? error.message : String(error) });
    }

    return back(request, { meta: "connected", pages: connectedPages, instagram: connectedInstagram, profile: profile ? 1 : 0, webhook, messenger: messengerGranted ? 1 : 0 });
  } catch (error) {
    console.error("Meta OAuth callback failed", { error: error instanceof Error ? error.message : String(error) });
    return back(request, { meta: "failed" });
  }
}

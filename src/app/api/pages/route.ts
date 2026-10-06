import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { facebookPages, notifications } from "@/db/schema";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { encryptToken } from "@/services/page-tokens";

export const dynamic = "force-dynamic";
const graph = (path: string) => fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}${path}`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => ({}));

/** Adds (or updates) a Facebook page from its own page access token. The token is stored encrypted and never returned. */
export async function POST(request: NextRequest) {
  const denied = await guard(request, true, "settings.manage");
  if (denied) return denied;
  const parsed = z.object({ token: z.string().trim().min(50).max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "الصق رمز وصول الصفحة كاملًا" }, { status: 400 });
  const token = encodeURIComponent(parsed.data.token);
  const debug = await graph(`/debug_token?input_token=${token}&access_token=${token}`);
  const info = debug?.data as { type?: string; is_valid?: boolean; expires_at?: number; scopes?: string[] } | undefined;
  if (!info?.is_valid) return NextResponse.json({ error: "الرمز غير صالح" }, { status: 400 });
  if (info.type !== "PAGE") return NextResponse.json({ error: "هذا رمز مستخدم وليس رمز صفحة. استخرج رمز الصفحة من me/accounts" }, { status: 400 });
  if (!info.scopes?.includes("pages_manage_posts")) return NextResponse.json({ error: "الرمز لا يملك صلاحية pages_manage_posts" }, { status: 400 });
  const page = await graph(`/me?fields=id,name&access_token=${token}`) as { id?: string; name?: string };
  if (!page.id || !page.name) return NextResponse.json({ error: "تعذر قراءة بيانات الصفحة بهذا الرمز" }, { status: 400 });
  const db = getDb();
  const [row] = await db.insert(facebookPages)
    .values({ name: page.name, facebookPageId: page.id, platform: "facebook", profileUrl: `https://www.facebook.com/${page.id}`, accessTokenEnc: encryptToken(parsed.data.token), isActive: true, status: "active", lastConnectionCheck: new Date() })
    .onConflictDoUpdate({ target: [facebookPages.platform, facebookPages.facebookPageId], set: { name: page.name, accessTokenEnc: encryptToken(parsed.data.token), isActive: true, status: "active", lastConnectionCheck: new Date(), updatedAt: new Date() } })
    .returning({ id: facebookPages.id, name: facebookPages.name });
  // Instagram accounts linked to this page publish with the same token.
  await db.update(facebookPages).set({ accessTokenEnc: encryptToken(parsed.data.token), updatedAt: new Date() }).where(and(eq(facebookPages.platform, "instagram"), eq(facebookPages.mcpConnectionReference, page.id)));
  await db.update(notifications).set({ isRead: true }).where(and(
    inArray(notifications.type, ["token_invalid", "token_expiring"]),
    ilike(notifications.title, `%${page.name}%`)
  ));
  await logAudit("page.added", "page", row.id, { facebookPageId: page.id, permanent: !info.expires_at });
  return NextResponse.json({ ...row, permanent: !info.expires_at, canReply: Boolean(info.scopes?.includes("pages_manage_engagement")) });
}

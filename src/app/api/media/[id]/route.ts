import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets, postMedia, posts } from "@/db/schema";
import { guard, isUuid } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { storageProvider } from "@/services/storage";

/** Soft-deletes a library item. Stored files referenced by unpublished posts are kept so those posts still work. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  const db = getDb();
  const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt))).limit(1);
  if (!asset) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  const inUse = await db.select({ id: posts.id }).from(postMedia).innerJoin(posts, eq(postMedia.postId, posts.id)).where(and(eq(postMedia.url, asset.url), inArray(posts.status, ["draft", "scheduled", "pending_approval", "approved", "publishing"]), isNull(posts.deletedAt))).limit(1);
  if (inUse.length) return NextResponse.json({ error: "الصورة مستخدمة في منشور لم يُنشر بعد" }, { status: 409 });
  await db.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, id));
  if (asset.storageKey) await storageProvider.remove(asset.storageKey).catch(() => undefined);
  await logAudit("media.deleted", "media", id);
  return NextResponse.json({ ok: true });
}

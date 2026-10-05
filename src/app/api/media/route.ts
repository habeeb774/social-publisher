import { NextRequest, NextResponse } from "next/server";
import { and, desc, ilike, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { errorResponse, guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { sendAlert } from "@/services/alerts";
import { probeImageUrl, storageProvider } from "@/services/storage";

export async function GET(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const rows = await getDb().select().from(mediaAssets).where(and(isNull(mediaAssets.deletedAt), q ? ilike(mediaAssets.name, `%${q.replace(/[%_]/g, "")}%`) : undefined)).orderBy(desc(mediaAssets.createdAt)).limit(120);
  return NextResponse.json({ items: rows, uploadEnabled: storageProvider.configured() });
}

/** Adds media by multipart upload (file) or by JSON {url, name}. URLs are probed before saving. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const db = getDb();
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "اختر صورة" }, { status: 400 });
      const stored = await storageProvider.upload(file).catch(async (error) => {
        if (error instanceof Error && error.message !== "STORAGE_NOT_CONFIGURED" && !/الصورة/.test(error.message)) await sendAlert("storage_error", "فشل رفع صورة", error.message, 1);
        throw error;
      });
      const [row] = await db.insert(mediaAssets).values({ name: file.name, url: stored.url, storageKey: stored.storageKey, mimeType: stored.mimeType, size: stored.size, source: "upload" }).returning();
      await logAudit("media.uploaded", "media", row.id);
      return NextResponse.json(row, { status: 201 });
    }
    const parsed = z.object({ url: z.url(), name: z.string().trim().max(160).optional() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "رابط غير صالح" }, { status: 400 });
    const probe = await probeImageUrl(parsed.data.url);
    if (!probe.ok) return NextResponse.json({ error: probe.reason }, { status: 422 });
    const [row] = await db.insert(mediaAssets).values({ name: parsed.data.name || parsed.data.url.split("/").pop()!.slice(0, 160), url: parsed.data.url, mimeType: probe.mimeType, size: probe.size ?? null, source: "url" }).onConflictDoNothing().returning();
    if (!row) return NextResponse.json({ error: "الصورة موجودة في المكتبة" }, { status: 409 });
    await logAudit("media.added", "media", row.id);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /الصورة/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return errorResponse(error);
  }
}

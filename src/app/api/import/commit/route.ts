import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { facebookPages, mediaAssets, postMedia, posts } from "@/db/schema";
import { guard } from "@/services/api-guard";
import { logAudit } from "@/services/audit";
import { normalizeTags, POST_CATEGORIES } from "@/services/catalog";
import { IMPORT_FIELDS, MAX_IMPORT_ROWS, mapRows } from "@/services/import";
import { addToQueue, approvalRequired } from "@/services/post-ops";
import { probeImageUrl } from "@/services/storage";

const fieldKeys = Object.keys(IMPORT_FIELDS) as [keyof typeof IMPORT_FIELDS];
const body = z.object({
  pageId: z.uuid(),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(MAX_IMPORT_ROWS),
  mapping: z.record(z.enum(fieldKeys), z.string()),
  defaultTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("20:00"),
  mode: z.enum(["draft", "schedule", "queue"]),
  dryRun: z.boolean().default(false),
});

/**
 * Step 2: validate with the chosen mapping (dryRun) or create posts. Rows with errors are skipped.
 * "schedule" only schedules ready rows with a future date; everything else becomes a draft.
 */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  const { pageId, rows, mapping, defaultTime, mode, dryRun } = parsed.data;
  if (!mapping.content) return NextResponse.json({ error: "اربط عمود «نص المنشور» أولًا" }, { status: 400 });
  const mapped = mapRows(rows, mapping, defaultTime);
  const summary = { total: mapped.length, valid: mapped.filter((r) => !r.errors.length).length, invalid: mapped.filter((r) => r.errors.length).length, rows: mapped.slice(0, 200).map((r) => ({ index: r.index, content: r.content.slice(0, 120), scheduledAt: r.scheduledAt?.toISOString() ?? null, imageUrl: r.imageUrl, errors: r.errors, warnings: r.warnings })) };
  if (dryRun) return NextResponse.json(summary);
  const db = getDb();
  const [page] = await db.select({ id: facebookPages.id }).from(facebookPages).where(and(eq(facebookPages.id, pageId), eq(facebookPages.isActive, true))).limit(1);
  if (!page) return NextResponse.json({ error: "الصفحة غير متاحة" }, { status: 409 });
  const approval = await approvalRequired();
  let created = 0, scheduled = 0, queued = 0, imageFailures = 0;
  const createdIds: string[] = [];
  for (const row of mapped.filter((r) => !r.errors.length)) {
    let canSchedule = Boolean(mode === "schedule" && row.ready && row.scheduledAt && row.scheduledAt.getTime() > Date.now() + 60000);
    // Same pre-publish rule as the editor: an unreachable image never gets scheduled.
    if (canSchedule && row.imageUrl && !(await probeImageUrl(row.imageUrl)).ok) { canSchedule = false; imageFailures++; }
    const category = POST_CATEGORIES.includes(row.category as typeof POST_CATEGORIES[number]) ? row.category : null;
    const [post] = await db.insert(posts).values({ pageId: page.id, content: row.content, scheduledAt: row.scheduledAt, status: canSchedule ? (approval ? "pending_approval" : "scheduled") : "draft", timezone: "Asia/Riyadh", category, tags: normalizeTags(row.tags) }).returning({ id: posts.id });
    createdIds.push(post.id); created++;
    if (canSchedule) scheduled++;
    if (row.imageUrl) {
      await db.insert(postMedia).values({ postId: post.id, type: "image", url: row.imageUrl });
      await db.insert(mediaAssets).values({ name: row.imageUrl.split("/").pop()!.slice(0, 160) || "image", url: row.imageUrl, source: "import" }).onConflictDoNothing();
    }
    if (mode === "queue" && row.ready) { try { await addToQueue(post.id); queued++; } catch { /* no slots: stays a draft */ } }
  }
  await logAudit("import.committed", "import", null, { created, scheduled, queued, skipped: summary.invalid, mode });
  return NextResponse.json({ ...summary, created, scheduled, queued, imageFailures, createdIds });
}

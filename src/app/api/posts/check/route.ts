import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { prePublishChecks } from "@/services/prepublish";

const body = z.object({ pageId: z.uuid(), content: z.string().max(70000), scheduledAt: z.coerce.date().nullable().optional(), imageUrl: z.string().nullable().optional(), postId: z.uuid().optional() });
/** Read-only pre-scheduling checklist. Uses POST only to carry the draft body. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  return NextResponse.json(await prePublishChecks({ ...parsed.data, imageUrl: parsed.data.imageUrl || null }));
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard } from "@/services/api-guard";
import { bulkAction } from "@/services/post-ops";
import { denyPageOutsideScope, denyPostOutsideScope } from "@/services/access-scope";

const body = z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(["schedule", "to_draft", "unschedule", "archive", "delete_drafts", "change_page", "assign_campaign"]), value: z.uuid().nullable().optional() });
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "حدد منشورات وإجراءً صالحًا" }, { status: 400 });
  for (const id of parsed.data.ids) { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  if (parsed.data.action === "change_page" && parsed.data.value) { const scoped = await denyPageOutsideScope(request, parsed.data.value); if (scoped) return scoped; }
  try { return NextResponse.json(await bulkAction(parsed.data.ids, parsed.data.action, parsed.data.value)); } catch (error) { return errorResponse(error); }
}

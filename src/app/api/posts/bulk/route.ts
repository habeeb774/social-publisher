import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guard } from "@/services/api-guard";
import { bulkAction } from "@/services/post-ops";

const body = z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(["schedule", "to_draft", "unschedule", "archive", "delete_drafts", "change_page", "assign_campaign"]), value: z.uuid().nullable().optional() });
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "حدد منشورات وإجراءً صالحًا" }, { status: 400 });
  try { return NextResponse.json(await bulkAction(parsed.data.ids, parsed.data.action, parsed.data.value)); } catch (error) { return errorResponse(error); }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { bulkAction } from "@/services/post-ops";
import { denyPageOutsideScope, denyPostOutsideScope } from "@/services/access-scope";
import { workspacePostMutationAccess } from "@/services/workspace-post-auth";
import { bulkPostPermissions } from "@/services/bulk-post-permissions";

const body = z.object({ ids: z.array(z.uuid()).min(1).max(200), action: z.enum(["schedule", "to_draft", "unschedule", "archive", "delete_drafts", "change_page", "assign_campaign"]), value: z.uuid().nullable().optional() });
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "حدد منشورات وإجراءً صالحًا" }, { status: 400 });
  try {
  const workspace = await workspacePostMutationAccess(request, bulkPostPermissions(parsed.data.action));
  if (workspace.response) return workspace.response;
  if (workspace.context && parsed.data.action === "assign_campaign" && parsed.data.value) return NextResponse.json({error:"ربط الحملات بمساحات العمل لم يُجهّز بعد.",code:"WORKSPACE_CAMPAIGN_UNAVAILABLE"},{status:409});
  for (const id of parsed.data.ids) { const scoped = await denyPostOutsideScope(request, id); if (scoped) return scoped; }
  if (parsed.data.action === "change_page" && parsed.data.value) { const scoped = await denyPageOutsideScope(request, parsed.data.value); if (scoped) return scoped; }
  return NextResponse.json(await bulkAction(parsed.data.ids, parsed.data.action, parsed.data.value, workspace.context), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAGE_REQUIRED" || code === "PAGE_UNAVAILABLE") {
      return NextResponse.json({ error: code === "PAGE_REQUIRED" ? "اختر صفحة" : "الصفحة غير متاحة", code }, { status: code === "PAGE_REQUIRED" ? 400 : 409 });
    }
    console.error("Bulk post operation unavailable", { code: "BULK_POST_UNAVAILABLE" });
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء الجماعي. حدّث القائمة قبل إعادة المحاولة.", code: "BULK_POST_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

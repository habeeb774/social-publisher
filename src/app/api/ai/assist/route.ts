import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/services/api-guard";
import { AI_ACTIONS, getAiProvider, type AiAction } from "@/services/ai-assistant";

const body = z.object({ action: z.enum(Object.keys(AI_ACTIONS) as [AiAction]), text: z.string().trim().min(1).max(8000) });
/** Returns a suggestion only; nothing is saved or published here. */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: "المساعد الذكي غير مفعّل" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "اكتب نصًا أولًا" }, { status: 400 });
  try { return NextResponse.json({ suggestion: await provider.run(parsed.data.action, parsed.data.text), provider: provider.name }); }
  catch (error) { console.error("AI assist failed", { error: error instanceof Error ? error.message : String(error) }); return NextResponse.json({ error: "تعذر الحصول على اقتراح" }, { status: 502 }); }
}

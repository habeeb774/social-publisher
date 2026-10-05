import { z } from "zod";

export const TEMPLATE_CATEGORIES = ["عرض منتج", "خبر", "إعلان", "تهنئة", "معلومة", "سؤال تفاعلي", "إعلان تخفيض", "عام"] as const;
export const POST_CATEGORIES = ["عروض", "أخبار", "منتجات", "محتوى تعليمي", "مناسبات", "تفاعل"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "completed", "archived"] as const;
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = { draft: "تخطيط", active: "نشطة", completed: "منتهية", archived: "مؤرشفة" };
export const campaignStatusLabel = (s: string) => CAMPAIGN_STATUS_LABELS[s] ?? s;

export const templateSchema = z.object({
  name: z.string().trim().min(1, "اسم القالب مطلوب").max(120),
  content: z.string().trim().min(1, "نص القالب مطلوب").max(63206),
  category: z.enum(TEMPLATE_CATEGORIES).default("عام"),
  defaultSettings: z.object({ category: z.enum(POST_CATEGORIES).optional(), tags: z.array(z.string().max(40)).max(20).optional() }).default({}),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
export const campaignSchema = z.object({
  name: z.string().trim().min(1, "اسم الحملة مطلوب").max(120),
  description: z.string().max(2000).nullable().optional(),
  startDate: day,
  endDate: day,
  status: z.enum(CAMPAIGN_STATUSES).default("active"),
}).refine((c) => !c.startDate || !c.endDate || c.startDate <= c.endDate, { message: "تاريخ النهاية قبل البداية", path: ["endDate"] });

/** Normalizes free-form tags: strips '#', trims, de-duplicates. Tags are internal only. */
export function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.replace(/^#+/, "").trim()).filter(Boolean))).slice(0, 20);
}

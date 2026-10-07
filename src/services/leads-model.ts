import { z } from "zod";
import { sql } from "drizzle-orm";

import { LEAD_STAGES } from "./leads-stages";
export const leadEditSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact: z.string().trim().max(500).nullable(),
  status: z.enum(LEAD_STAGES),
  notes: z.string().trim().max(10000).nullable(),
  expectedUpdatedAt: z.string().max(60).refine(value => /^\d{4}-\d{2}-\d{2}[ T]/.test(value) && Number.isFinite(Date.parse(value)), "وقت التحديث غير صالح"),
}).strict();
export function leadUpdateValues(input: z.infer<typeof leadEditSchema>) {
  return sql`name=${input.name},contact=${input.contact},status=${input.status},notes=${input.notes},updated_at=now()`;
}

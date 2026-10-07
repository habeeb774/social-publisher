import { z } from "zod";

const savedRuleSchema = z.object({ id: z.string().uuid() });

export function savedRuleId(result: unknown, expectedId: string | null): string {
  const parsed = savedRuleSchema.safeParse(result);
  if (!parsed.success || (expectedId !== null && parsed.data.id !== expectedId)) {
    throw new Error("RULE_SAVE_UNCONFIRMED");
  }
  return parsed.data.id;
}

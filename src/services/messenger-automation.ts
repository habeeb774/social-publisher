import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { getSetting, setSetting } from "./settings-store";

const KEY = "messenger_automation_rules_v1";
const ENABLED_KEY = "messenger_automation_enabled";
const COOLDOWN_MINUTES = 360;

export const messengerRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  active: z.boolean().default(true),
  operator: z.enum(["contains", "equals", "starts_with", "any"]),
  keywords: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  replyText: z.string().trim().min(1).max(2000),
  pageIds: z.array(z.string().uuid()).max(100).default([]),
  requireApproval: z.boolean().default(true),
  priority: z.number().int().min(1).max(999).default(100),
}).superRefine((rule, ctx) => {
  if (rule.operator !== "any" && !rule.keywords.length) {
    ctx.addIssue({ code: "custom", message: "أضف كلمة مفتاحية واحدة على الأقل", path: ["keywords"] });
  }
});
export type MessengerAutomationRule = z.infer<typeof messengerRuleSchema> & { id: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("ar");
const sensitive = /(شكوى|احتيال|نصب|تهديد|استرجاع|استرداد|دفع|تحويل|حوالة|complaint|refund|fraud|payment|chargeback)/i;

export async function messengerAutomationEnabled() {
  return getSetting<boolean>(ENABLED_KEY, false);
}

export async function setMessengerAutomationEnabled(enabled: boolean) {
  await setSetting(ENABLED_KEY, enabled);
  return { enabled };
}

export async function listMessengerAutomationRules(): Promise<MessengerAutomationRule[]> {
  const raw = await getSetting<unknown[]>(KEY, []);
  const rules: MessengerAutomationRule[] = [];
  for (const item of raw) {
    const parsed = messengerRuleSchema.safeParse(item);
    if (parsed.success) rules.push({ ...parsed.data, id: parsed.data.id ?? randomUUID() });
  }
  return rules.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "ar"));
}

export async function saveMessengerAutomationRule(input: z.input<typeof messengerRuleSchema>, id?: string) {
  const parsed = messengerRuleSchema.parse({ ...input, id: id ?? input.id ?? randomUUID() });
  const rules = await listMessengerAutomationRules();
  const next: MessengerAutomationRule = { ...parsed, id: parsed.id ?? randomUUID() };
  const merged = [...rules.filter((rule) => rule.id !== next.id), next]
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "ar"));
  await setSetting(KEY, merged);
  return next;
}

export async function deleteMessengerAutomationRule(id: string) {
  const rules = await listMessengerAutomationRules();
  await setSetting(KEY, rules.filter((rule) => rule.id !== id));
  return { ok: true };
}

function matches(rule: MessengerAutomationRule, message: string) {
  const text = normalize(message);
  if (rule.operator === "any") return true;
  const keys = rule.keywords.map(normalize);
  if (rule.operator === "equals") return keys.some((key) => text === key);
  if (rule.operator === "starts_with") return keys.some((key) => text.startsWith(key));
  return keys.some((key) => text.includes(key));
}

export async function planMessengerAutomation(input: {
  conversationId: string;
  pageId: string;
  message: string;
}) {
  if (!await messengerAutomationEnabled()) return { matched: false as const, reason: "DISABLED" };
  if (sensitive.test(input.message)) return { matched: false as const, reason: "SENSITIVE_HUMAN_REVIEW" };

  const db = getDb();
  const cooldown = await db.execute(sql`select 1 from activity_logs where entity_type='messenger_conversation'
    and entity_id=${input.conversationId}::uuid
    and action='messenger.auto_reply_sent'
    and created_at > now() - (${COOLDOWN_MINUTES} || ' minutes')::interval
    limit 1`);
  if (cooldown.rows.length) return { matched: false as const, reason: "COOLDOWN" };

  const rules = await listMessengerAutomationRules();
  const rule = rules.find((item) => item.active && (!item.pageIds.length || item.pageIds.includes(input.pageId)) && matches(item, input.message));
  if (!rule) return { matched: false as const, reason: "NO_MATCH" };
  return { matched: true as const, rule };
}

export async function recordMessengerAutomation(conversationId: string, ruleId: string, status: "sent" | "approval" | "failed", metadata: Record<string, unknown> = {}) {
  const action = status === "sent" ? "messenger.auto_reply_sent" : status === "approval" ? "messenger.auto_reply_approval" : "messenger.auto_reply_failed";
  await getDb().execute(sql`insert into activity_logs(action,entity_type,entity_id,metadata)
    values(${action},'messenger_conversation',${conversationId}::uuid,${JSON.stringify({ ruleId, ...metadata })}::jsonb)`);
}

export function isSensitiveMessengerMessage(message: string) {
  return sensitive.test(message);
}

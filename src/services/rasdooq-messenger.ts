import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { logAudit } from "./audit";
import { listMessengerAutomationRules, messengerAutomationEnabled, saveMessengerAutomationRule, setMessengerAutomationEnabled } from "./messenger-automation";
import { politicsTargetPage } from "./politics-autopost";

const SEEDED_KEY = "rasdooq_messenger_rules_seeded_v1";

/** Neutral replies for a news page: no opinions, no confirming or denying stories. */
const RULES = [
  { name: "رصدوق · إرسال خبر أو تصحيح", operator: "contains" as const, keywords: ["خبر", "عندي", "اقتراح", "تصحيح", "معلومة"], replyText: "شكرًا لتواصلك، استلمنا رسالتك وسيطّلع عليها فريق الصفحة.", priority: 10 },
  { name: "رصدوق · سؤال عن المصدر", operator: "contains" as const, keywords: ["مصدر", "صحيح", "أكيد", "اكيد", "تأكيد", "حقيقي"], replyText: "ننقل الأخبار من مصادرها كما وردت، وتجد رابط المصدر داخل كل منشور. شكرًا لاهتمامك.", priority: 20 },
  { name: "رصدوق · ترحيب", operator: "any" as const, keywords: [], replyText: "أهلًا بك في رَصْدُوق 👋 نتابع لك آخر الأخبار والمستجدات. استلمنا رسالتك وسنرد عليك قريبًا.", priority: 90 },
];

/**
 * Adds the رَصْدُوق Messenger rules once, scoped to that page only. The global switch is turned on
 * only when no other active rule exists, so enabling it never starts replies on other pages.
 */
export async function seedRasdooqMessengerRules() {
  const db = getDb();
  const claim = await db.insert(settings).values({ key: SEEDED_KEY, value: JSON.stringify({ at: new Date().toISOString() }) }).onConflictDoNothing().returning({ key: settings.key });
  if (!claim.length) return { seeded: false as const, reason: "ALREADY_SEEDED" };
  const page = await politicsTargetPage();
  if (!page) {
    await db.delete(settings).where(eq(settings.key, SEEDED_KEY)); // retry on a later tick once the page is linked
    return { seeded: false as const, reason: "PAGE_UNAVAILABLE" };
  }
  const existing = await listMessengerAutomationRules();
  for (const rule of RULES) await saveMessengerAutomationRule({ ...rule, active: true, pageIds: [page.id], requireApproval: false });
  const othersActive = existing.some((rule) => rule.active);
  let enabled = await messengerAutomationEnabled();
  if (!enabled && !othersActive) { await setMessengerAutomationEnabled(true); enabled = true; }
  await logAudit("messenger.rasdooq_rules_seeded", "page", page.id, { rules: RULES.length, enabled, othersActive });
  return { seeded: true as const, enabled, othersActive };
}


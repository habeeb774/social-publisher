import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";

import { getSetting } from "./settings-store";

export const ALERT_TYPES = {
  scheduled: "تمت جدولة منشور",
  published: "تم نشر منشور",
  publish_failed: "فشل النشر",
  approved: "تمت الموافقة",
  rejected: "تم رفض منشور",
  token_invalid: "Facebook يحتاج إعادة ربط",
  token_expiring: "توكن Facebook ينتهي قريبًا",
  scheduler_gap: "توقف عامل النشر",
  storage_error: "خطأ في التخزين",
} as const;
export type AlertType = keyof typeof ALERT_TYPES;
export type AlertPrefs = Partial<Record<AlertType, { inApp: boolean; email: boolean }>>;
/** Defaults: everything in-app; email only for problems that need action. */
export const defaultPref = (type: AlertType) => ({ inApp: true, email: ["publish_failed", "token_invalid", "token_expiring", "scheduler_gap", "storage_error"].includes(type) });

/**
 * Records an in-app notification and, when RESEND_API_KEY is set, emails ALERT_EMAIL (or ADMIN_EMAIL).
 * The same title is not repeated within `dedupeHours`. Never throws: alerting must not break publishing.
 */
export async function sendAlert(type: AlertType, title: string, message: string, dedupeHours = 12) {
  try {
    const db = getDb();
    const since = new Date(Date.now() - dedupeHours * 3600 * 1000);
    const [existing] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.title, title), gt(notifications.createdAt, since))).limit(1);
    if (dedupeHours > 0 && existing) return { sent: false, reason: "duplicate" as const };
    const prefs = await getSetting<AlertPrefs>("notification_prefs", {}).catch(() => ({} as AlertPrefs));
    const pref = { ...defaultPref(type), ...prefs[type] };
    if (pref.inApp) await db.insert(notifications).values({ type, title, message });
    const emailed = pref.email ? await sendEmail(title, message) : false;
    return { sent: true, emailed };
  } catch (error) {
    console.error("Alert delivery failed", { type, error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "error" as const };
  }
}

const FALLBACK_FROM = "Social Publisher <onboarding@resend.dev>";

/** Posts to Resend from ALERT_FROM; if that domain is not verified yet, retries from Resend's shared address. */
async function postResend(key: string, to: string, subject: string, text: string) {
  const send = (from: string) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `[ناشر المحتوى] ${subject}`, text }),
    signal: AbortSignal.timeout(10000),
  });
  const preferred = process.env.ALERT_FROM?.trim();
  let from = preferred || FALLBACK_FROM;
  let response = await send(from);
  if (!response.ok && preferred && (response.status === 403 || response.status === 422)) {
    console.error("ALERT_FROM rejected by Resend; using fallback sender", { status: response.status });
    from = FALLBACK_FROM;
    response = await send(from);
  }
  return { response, from };
}

export async function sendEmail(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL)?.trim();
  if (!key || !to) return false;
  const { response } = await postResend(key, to, subject, text);
  if (!response.ok) console.error("Resend rejected alert email", { status: response.status });
  return response.ok;
}

/** Sends a test email and reports Resend's exact answer (no secrets). */
export async function sendTestEmail() {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL)?.trim();
  if (!key) return { ok: false, to: to ?? null, error: "RESEND_API_KEY غير مضاف في Vercel" };
  if (!to) return { ok: false, to: null, error: "لا يوجد بريد مستلم (ALERT_EMAIL أو ADMIN_EMAIL)" };
  try {
    const { response, from } = await postResend(key, to, "رسالة تجريبية", `هذه رسالة تجريبية من نظام النشر.
إذا وصلتك فتنبيهات البريد تعمل.

${new Date().toISOString()}`);
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    return response.ok ? { ok: true, to, from, id: body.id ?? null } : { ok: false, to, from, error: `Resend ${response.status}: ${body.message ?? body.name ?? "rejected"}` };
  } catch (error) { return { ok: false, to, error: error instanceof Error ? error.message : "network error" }; }
}

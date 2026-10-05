import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";

export type AlertType = "publish_failed" | "scheduler_gap" | "token_expiring" | "token_invalid";

/**
 * Records an in-app notification and, when RESEND_API_KEY is set, emails ALERT_EMAIL (or ADMIN_EMAIL).
 * The same title is not repeated within `dedupeHours`. Never throws: alerting must not break publishing.
 */
export async function sendAlert(type: AlertType, title: string, message: string, dedupeHours = 12) {
  try {
    const db = getDb();
    const since = new Date(Date.now() - dedupeHours * 3600 * 1000);
    const [existing] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.title, title), gt(notifications.createdAt, since))).limit(1);
    if (existing) return { sent: false, reason: "duplicate" as const };
    await db.insert(notifications).values({ type, title, message });
    const emailed = await sendEmail(title, message);
    return { sent: true, emailed };
  } catch (error) {
    console.error("Alert delivery failed", { type, error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "error" as const };
  }
}

async function sendEmail(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL)?.trim();
  if (!key || !to) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM?.trim() || "Social Publisher <onboarding@resend.dev>", to: [to], subject: `[ناشر المحتوى] ${subject}`, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) console.error("Resend rejected alert email", { status: response.status });
  return response.ok;
}

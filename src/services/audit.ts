import { getDb } from "@/db";
import { activityLogs } from "@/db/schema";

/** The system has one admin account today; every authenticated action is attributed to it. */
export const currentActor = () => process.env.ADMIN_EMAIL?.trim() || "admin";

/** Best-effort audit trail. Never throws so it cannot break the action it records. */
export async function logAudit(action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await getDb().insert(activityLogs).values({ action, entityType, entityId, metadata: { actor: currentActor(), ...metadata } });
  } catch (error) {
    console.error("Audit log failed", { action, error: error instanceof Error ? error.message : String(error) });
  }
}

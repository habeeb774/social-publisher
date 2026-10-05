import { getDb } from "@/db";
import { activityLogs } from "@/db/schema";

import { AsyncLocalStorage } from "node:async_hooks";

// The authenticated user is bound per request by guard(); background work (cron) has no actor.
const actorStore = new AsyncLocalStorage<string>();
export function bindActor(actor: string) { actorStore.enterWith(actor); }
export const currentActor = () => actorStore.getStore() ?? process.env.ADMIN_EMAIL?.trim() ?? "system";

/** Best-effort audit trail. Never throws so it cannot break the action it records. */
export async function logAudit(action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  try {
    await getDb().insert(activityLogs).values({ action, entityType, entityId, metadata: { actor: currentActor(), ...metadata } });
  } catch (error) {
    console.error("Audit log failed", { action, error: error instanceof Error ? error.message : String(error) });
  }
}

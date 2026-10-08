import { getDb } from "@/db";
import { processMetaWebhook } from "./meta-webhook";
import { claimWebhookDeliveryQuery, finishWebhookDeliveryQuery, persistWebhookDeliveryQuery, recoverWebhookClaimsQuery } from "./meta-webhook-delivery-queries";
import { createWebhookWorker, type WebhookClaim } from "./meta-webhook-worker";

export async function persistWebhookDelivery(delivery: { digest: string; payload: Record<string, unknown> }) {
  await getDb().execute(persistWebhookDeliveryQuery(delivery.digest, delivery.payload));
}

export const processStoredWebhooks = createWebhookWorker({
  recover: async () => { await getDb().execute(recoverWebhookClaimsQuery()); },
  claim: async token => {
    const rows = (await getDb().execute(claimWebhookDeliveryQuery(token))).rows;
    return rows.length ? rows[0] as WebhookClaim : null;
  },
  process: payload => processMetaWebhook(payload),
  finish: async (id, token, success) => (await getDb().execute(finishWebhookDeliveryQuery(id, token, success))).rows.length > 0,
});

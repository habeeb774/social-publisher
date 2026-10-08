import { sql } from "drizzle-orm";

export function persistWebhookDeliveryQuery(digest: string, payload: Record<string, unknown>) {
  return sql`insert into meta_webhook_deliveries(digest,payload)
    values(${digest},${JSON.stringify(payload)}::jsonb) on conflict(digest) do nothing`;
}

export function claimWebhookDeliveryQuery(token: string) {
  return sql`update meta_webhook_deliveries set status='processing',claim_token=${token}::uuid,
    claimed_at=now(),updated_at=now()
    where id=(select id from meta_webhook_deliveries where status='pending'
      order by created_at,id limit 1 for update skip locked)
      and status='pending' returning id,payload,claim_token`;
}

/** Fence completion to the exact claim, including when recovery already marked it uncertain. */
export function finishWebhookDeliveryQuery(id: string, token: string, succeeded: boolean) {
  return sql`update meta_webhook_deliveries set status=${succeeded ? "completed" : "needs_review"},
    claim_token=null,claimed_at=null,finished_at=now(),updated_at=now(),
    last_error_code=${succeeded ? null : "META_WEBHOOK_PROCESS_FAILED"}
    where id=${id}::uuid and claim_token=${token}::uuid and status='processing' returning id`;
}

/** Never replay an interrupted external write automatically: its outcome may be unknown. */
export function recoverWebhookClaimsQuery() {
  return sql`update meta_webhook_deliveries set status='needs_review',claim_token=null,
    claimed_at=null,updated_at=now(),last_error_code='META_WEBHOOK_PROCESS_INTERRUPTED'
    where status='processing' and claimed_at < now()-interval '5 minutes' returning id`;
}

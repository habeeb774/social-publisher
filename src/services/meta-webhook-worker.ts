export type WebhookClaim = { id: string; payload: Record<string, unknown>; claim_token: string };
type WorkerDependencies = {
  recover: () => Promise<void>;
  claim: (token: string) => Promise<WebhookClaim | null>;
  process: (payload: Record<string, unknown>) => Promise<{ failed: number }>;
  finish: (id: string, token: string, succeeded: boolean) => Promise<boolean>;
};

/** External side effects are never blindly replayed after an interrupted/partial attempt. */
export function createWebhookWorker(deps: WorkerDependencies) {
  return async (limit = 5) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("INVALID_WEBHOOK_BATCH_LIMIT");
    await deps.recover();
    const deadline = Date.now() + 40000;
    const result = { completed: 0, needsReview: 0, lostClaim: 0 };
    for (let i = 0; i < limit && Date.now() < deadline; i++) {
      const claim = await deps.claim(crypto.randomUUID());
      if (!claim) break;
      let succeeded = false;
      try { succeeded = (await deps.process(claim.payload)).failed === 0; }
      catch { console.error("Meta webhook worker processing failed", { code: "META_WEBHOOK_PROCESS_FAILED" }); }
      // If this write fails, retain the claim; recovery flags its uncertain outcome.
      const finished = await deps.finish(claim.id, claim.claim_token, succeeded);
      if (!finished) result.lostClaim++;
      else if (succeeded) result.completed++;
      else result.needsReview++;
    }
    return result;
  };
}

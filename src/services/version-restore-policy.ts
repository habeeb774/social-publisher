/** Restored content is a new revision, never covered by a previous publishing approval. */
export function versionRestoreState(scheduledAt: Date | null, now = Date.now()) {
  return {
    status: "draft" as const,
    inQueue: false,
    scheduledAt: scheduledAt && Number.isFinite(scheduledAt.getTime()) && scheduledAt.getTime() > now + 60000 ? scheduledAt : null,
  };
}

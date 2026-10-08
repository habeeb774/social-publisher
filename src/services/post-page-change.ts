/** Moving to another publishing destination always requires a fresh review/schedule. */
export function pageChangeState() {
  return {
    status: "draft" as const,
    scheduledAt: null,
    inQueue: false,
    queueOrder: null,
    failedAt: null,
    lastError: null,
  };
}

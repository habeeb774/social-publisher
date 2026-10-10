type Check = { label: string; ok: boolean; critical: boolean; detail?: string };

/** Explain blockers only; warnings must never be presented as mandatory failures. */
export function prepublishBlockingMessage(items: Check[]) {
  const blockers = items.filter((item) => item.critical && !item.ok);
  return blockers.length
    ? `تعذرت الجدولة: ${blockers.map((item) => `${item.label}${item.detail ? ` — ${item.detail}` : ""}`).join(" · ")}`
    : "تعذرت الجدولة. راجع قائمة الفحص وأعد المحاولة.";
}

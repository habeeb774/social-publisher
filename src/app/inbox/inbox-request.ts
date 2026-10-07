/** Reads are bounded; writes must not be retried automatically after uncertainty. */
export async function inboxJson<T>(url: string, init?: RequestInit): Promise<T> {
  const reading = !init?.method || init.method.toUpperCase() === "GET";
  const response = await fetch(url, {
    ...init,
    ...(reading ? { signal: init?.signal ?? AbortSignal.timeout(15000), cache: "no-store" } : {}),
  });
  if (!response.ok) throw new Error("تعذر التنفيذ. حاول مرة أخرى.");
  const data = await response.json().catch(() => { throw new Error("تعذر قراءة البيانات. حاول مرة أخرى."); });
  return data as T;
}

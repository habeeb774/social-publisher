/** JSON fetch helper for client components; throws the server's Arabic error message. */
export async function api<T = unknown>(url: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(url, { ...init, headers: isForm || init?.body === undefined ? init?.headers : { "Content-Type": "application/json", ...init?.headers }, body: isForm ? init!.body as FormData : init?.body === undefined ? undefined : JSON.stringify(init.body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "تعذر تنفيذ العملية");
  return data as T;
}

export const STATUS_LABELS: Record<string, string> = { draft: "مسودة", scheduled: "مجدول", publishing: "جارٍ النشر", published: "منشور", failed: "فشل", cancelled: "ملغي", archived: "مؤرشف", pending_approval: "بانتظار الموافقة", approved: "موافق عليه" };
export const riyadh = (value: string | Date | null | undefined, style: "full" | "time" = "full") => value ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", ...(style === "time" ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }) }).format(new Date(value)) : "—";
export const ago = (value: string | Date) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 10) return "الآن";
  if (s < 60) return `منذ ${s} ثانية`;
  if (s < 3600) return `منذ ${Math.round(s / 60)} دقيقة`;
  if (s < 86400) return `منذ ${Math.round(s / 3600)} ساعة`;
  return `منذ ${Math.round(s / 86400)} يوم`;
};

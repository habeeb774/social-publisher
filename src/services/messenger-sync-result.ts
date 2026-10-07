import { z } from "zod";

const resultSchema = z.object({ imported: z.number().int().nonnegative(), status: z.record(z.string(), z.string().nullable()) });
export function safeMessengerSyncPages(pages: Record<string, string | null>) {
  return Object.fromEntries(Object.entries(pages).map(([page, error]) => [page, error === null ? null : "تعذرت مزامنة الصفحة. راجع الاتصال والصلاحيات."]));
}

export function messengerSyncNotice(result: unknown): { message: string; type: "success" | "warning" | "error" | "info" } {
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) return { type: "error", message: "لم تتأكد نتيجة المزامنة. حدّث الرسائل وراجع حالة الاتصال." };
  const { imported, status } = parsed.data;
  const results = Object.values(status), failed = results.filter(error => error !== null).length;
  if (!results.length) return { type: "info", message: "لم تُزامَن أي صفحة. تحقق من الصفحات المتاحة واتصال Messenger." };
  if (failed === results.length) return { type: "error", message: `تعذرت المزامنة الكاملة لكل الصفحات؛ استُوردت ${imported} رسالة قبل انتهاء المحاولة. راجع الاتصال والصلاحيات.` };
  if (failed) return { type: "warning", message: `المزامنة جزئية: استُوردت ${imported} رسالة، وتعذرت مزامنة ${failed} صفحة.` };
  return { type: "success", message: `اكتملت المزامنة (${imported} رسالة جديدة).` };
}

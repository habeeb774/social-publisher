import { del, put } from "@vercel/blob";

export type StoredMedia = { url: string; storageKey: string; mimeType: string; size: number };
export interface StorageProvider { configured(): boolean; upload(file: File): Promise<StoredMedia>; remove(storageKey: string): Promise<void>; }

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;

export function validateImage(file: File) {
  if (!allowed.has(file.type)) throw new Error("نوع الصورة غير مدعوم");
  if (file.size > maxBytes) throw new Error("حجم الصورة يتجاوز 10MB");
}

/** Vercel Blob when BLOB_READ_WRITE_TOKEN is present; otherwise uploads are disabled and URLs can still be added. */
export const storageProvider: StorageProvider = {
  configured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  async upload(file) {
    validateImage(file);
    if (!this.configured()) throw new Error("STORAGE_NOT_CONFIGURED");
    const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "image";
    const blob = await put(`media/${Date.now()}-${safeName}`, file, { access: "public", contentType: file.type });
    return { url: blob.url, storageKey: blob.pathname, mimeType: file.type, size: file.size };
  },
  async remove(storageKey) {
    if (this.configured() && storageKey) await del(storageKey);
  },
};

/** Lightweight availability probe for an image URL (no download of the body). */
export async function probeImageUrl(url: string) {
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: "يجب أن يبدأ الرابط بـ https://" };
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok) return { ok: false, reason: `الرابط يرجع ${response.status}` };
    if (!type.startsWith("image/")) return { ok: false, reason: "الرابط ليس صورة مباشرة" };
    return { ok: true, mimeType: type.split(";")[0], size: Number(response.headers.get("content-length")) || null };
  } catch {
    return { ok: false, reason: "تعذر الوصول للرابط" };
  }
}

export type StoredMedia = { url: string; storageKey: string; mimeType: string; size: number };
export interface StorageProvider { upload(file: File): Promise<StoredMedia>; remove(storageKey: string): Promise<void>; }

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;

export function validateImage(file: File) {
  if (!allowed.has(file.type)) throw new Error("نوع الصورة غير مدعوم");
  if (file.size > maxBytes) throw new Error("حجم الصورة يتجاوز 10MB");
}

/** Development provider. Production should inject Cloudinary or Vercel Blob. */
export const disabledStorageProvider: StorageProvider = {
  async upload(file) { validateImage(file); throw new Error("لم يتم إعداد مزود التخزين"); },
  async remove() { return; },
};

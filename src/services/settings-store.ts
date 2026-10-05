import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}
export async function setSetting(key: string, value: unknown) {
  const text = JSON.stringify(value);
  await getDb().insert(settings).values({ key, value: text }).onConflictDoUpdate({ target: settings.key, set: { value: text, updatedAt: new Date() } });
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";

// Per-page tokens are stored encrypted (AES-256-GCM) with a key derived from AUTH_SECRET; they are never returned to the browser.
const key = () => {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET_MISSING");
  return createHash("sha256").update(`page-token:${secret}`).digest();
};
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}
export function decryptToken(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("PAGE_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
/** The token saved for this Facebook page, if any. */
export async function storedPageToken(facebookPageId: string) {
  try {
    const [row] = await getDb().select({ enc: facebookPages.accessTokenEnc }).from(facebookPages).where(and(eq(facebookPages.facebookPageId, facebookPageId), eq(facebookPages.platform, "facebook"))).limit(1);
    return row?.enc ? decryptToken(row.enc) : null;
  } catch { return null; }
}

import { createECDH } from "node:crypto";
type PushEnv = { [key: string]: string | undefined; NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string };

/** Server-only readiness: never return private key material to clients. */
export function pushConfiguration(env: PushEnv = process.env) {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  const key = (value: string, size: number) => /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value, "base64url").length === size;
  let validSubject = false;
  try { const url = new URL(subject); validSubject = (url.protocol === "mailto:" && url.pathname.includes("@")) || (url.protocol === "https:" && Boolean(url.hostname)); } catch { /* not configured */ }
  let matchingKeys = false;
  if(key(publicKey,65) && key(privateKey,32))try{const curve=createECDH("prime256v1");curve.setPrivateKey(Buffer.from(privateKey,"base64url"));matchingKeys=curve.getPublicKey().equals(Buffer.from(publicKey,"base64url"));}catch{ /* invalid curve key */ }
  const configured = matchingKeys && validSubject;
  return { configured, publicKey: configured ? publicKey : null };
}

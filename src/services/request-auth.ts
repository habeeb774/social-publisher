import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "sp_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

// Signed with a server-only secret so the cookie cannot be forged by setting a constant value.
const secret = () => process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";

async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(now = Date.now()) {
  if (!secret()) throw new Error("AUTH_SECRET_MISSING");
  const payload = `v1.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !secret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expires, signature] = parts;
  if (version !== "v1" || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expiration = Number(expires);
  const currentSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiration) || expiration <= currentSeconds || expiration > currentSeconds + SESSION_TTL_SECONDS) return false;
  const expected = await sign(`${version}.${expires}`);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export function isAdminRequest(request: NextRequest) {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

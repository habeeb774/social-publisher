import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "sp_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const ROLES = ["admin", "editor", "reviewer", "viewer"] as const;
export type Role = typeof ROLES[number];
/** "env-admin" is the bootstrap administrator configured by ADMIN_EMAIL / ADMIN_PASSWORD. */
export type Session = { userId: string; role: Role };

// Signed with a server-only secret so the cookie cannot be forged. Works in Edge (middleware) and Node.
const secret = () => process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";

async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** v2 token: v2.<userId>.<role>.<expires>.<hmac>. */
export async function createSessionToken(session: Session = { userId: "env-admin", role: "admin" }, now = Date.now()) {
  if (!secret()) throw new Error("AUTH_SECRET_MISSING");
  if (!/^[a-z0-9-]{1,64}$/i.test(session.userId) || !ROLES.includes(session.role)) throw new Error("INVALID_SESSION");
  const payload = `v2.${session.userId}.${session.role}.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await sign(payload)}`;
}

export async function readSession(token: string | undefined, now = Date.now()): Promise<Session | null> {
  if (!token || !secret()) return null;
  const parts = token.split(".");
  const currentSeconds = Math.floor(now / 1000);
  const validExpiry = (e: string) => /^\d+$/.test(e) && Number(e) > currentSeconds && Number(e) <= currentSeconds + SESSION_TTL_SECONDS;
  if (parts[0] === "v1" && parts.length === 3) {
    // Legacy single-admin sessions issued before roles existed.
    const [v, expires, signature] = parts;
    if (!validExpiry(expires) || !/^[a-f0-9]{64}$/.test(signature) || !safeEqual(await sign(`${v}.${expires}`), signature)) return null;
    return { userId: "env-admin", role: "admin" };
  }
  if (parts[0] !== "v2" || parts.length !== 5) return null;
  const [v, userId, role, expires, signature] = parts;
  if (!/^[a-z0-9-]{1,64}$/i.test(userId) || !ROLES.includes(role as Role) || !validExpiry(expires) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  if (!safeEqual(await sign(`${v}.${userId}.${role}.${expires}`), signature)) return null;
  return { userId, role: role as Role };
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  return Boolean(await readSession(token, now));
}
export function sessionFrom(request: NextRequest) {
  return readSession(request.cookies.get(SESSION_COOKIE)?.value);
}
/** True for any signed-in role. Use rbac.can() for action-level checks. */
export async function isAdminRequest(request: NextRequest) {
  return Boolean(await sessionFrom(request));
}

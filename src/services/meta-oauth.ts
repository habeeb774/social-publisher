import { createHmac, timingSafeEqual } from "node:crypto";

const graphVersion = () => process.env.META_GRAPH_VERSION?.trim() || "v23.0";
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;
const facebookBase = () => `https://www.facebook.com/${graphVersion()}`;

export const META_OAUTH_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_content_publish",
] as const;

export function metaOAuthConfigured() {
  return Boolean(
    process.env.META_APP_ID?.trim() &&
    process.env.META_APP_SECRET?.trim() &&
    process.env.AUTH_SECRET?.trim()
  );
}

export function metaRedirectUri(origin?: string) {
  const app = process.env.APP_URL?.trim().replace(/\/$/, "");
  const base = app || origin?.replace(/\/$/, "");
  if (!base) throw new Error("APP_URL_MISSING");
  return `${base}/api/meta/oauth/callback`;
}

type StatePayload = { ts: number; nonce: string; returnTo: string };

function stateKey() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET_MISSING");
  return secret;
}

function sign(encoded: string) {
  return createHmac("sha256", stateKey()).update(encoded).digest("base64url");
}

export function createMetaState(returnTo = "/pages") {
  const payload: StatePayload = {
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    returnTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/pages",
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyMetaState(value: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (!payload.ts || Date.now() - payload.ts > 10 * 60 * 1000) return null;
    if (!payload.returnTo?.startsWith("/") || payload.returnTo.startsWith("//")) return null;
    return payload;
  } catch {
    return null;
  }
}

export function metaAuthorizationUrl(redirectUri: string, state: string) {
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) throw new Error("META_APP_ID_MISSING");
  const url = new URL(`${facebookBase()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  return url.toString();
}

type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string; code?: number } };

async function graphJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || body.error) {
    throw new Error(`META_OAUTH_ERROR: ${body.error?.message ?? `HTTP ${response.status}`}`);
  }
  return body;
}

export async function exchangeMetaCode(code: string, redirectUri: string) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("META_OAUTH_NOT_CONFIGURED");

  const exchange = new URL(`${graphBase()}/oauth/access_token`);
  exchange.searchParams.set("client_id", appId);
  exchange.searchParams.set("client_secret", appSecret);
  exchange.searchParams.set("redirect_uri", redirectUri);
  exchange.searchParams.set("code", code);
  const short = await graphJson<TokenResponse>(exchange.toString());
  if (!short.access_token) throw new Error("META_OAUTH_TOKEN_MISSING");

  const longUrl = new URL(`${graphBase()}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", short.access_token);

  try {
    const long = await graphJson<TokenResponse>(longUrl.toString());
    return long.access_token || short.access_token;
  } catch {
    return short.access_token;
  }
}

export type MetaManagedPage = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
};

export async function managedMetaPages(userToken: string) {
  const url = new URL(`${graphBase()}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,tasks,instagram_business_account{id,username}");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userToken);
  const result = await graphJson<{ data?: MetaManagedPage[] }>(url.toString());
  return (result.data ?? []).filter((page) => page.id && page.name && page.access_token);
}

export async function metaGrantedPermissions(userToken: string) {
  const url = new URL(`${graphBase()}/me/permissions`);
  url.searchParams.set("access_token", userToken);
  const result = await graphJson<{ data?: Array<{ permission: string; status: string }> }>(url.toString());
  return (result.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
}


export type MetaUserProfile = {
  id: string;
  name: string;
  pictureUrl?: string | null;
};

export async function metaUserProfile(userToken: string): Promise<MetaUserProfile> {
  const url = new URL(`${graphBase()}/me`);
  url.searchParams.set("fields", "id,name,picture.width(200).height(200)");
  url.searchParams.set("access_token", userToken);
  const result = await graphJson<{
    id?: string;
    name?: string;
    picture?: { data?: { url?: string } };
  }>(url.toString());
  if (!result.id || !result.name) throw new Error("META_PROFILE_MISSING");
  return {
    id: result.id,
    name: result.name,
    pictureUrl: result.picture?.data?.url ?? null,
  };
}

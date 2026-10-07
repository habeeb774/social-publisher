import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { decryptToken, encryptToken } from "./page-tokens";
import { getSetting, setSetting } from "./settings-store";

type Connection = { token: string; connectedAt: string; subscribed: boolean };
const connectionKey = (pageId: string) => `messenger.connection.${pageId}`;

export async function messengerPageConnected(pageId: string) {
  const saved = await getSetting<Connection | null>(connectionKey(pageId), null);
  return Boolean(saved?.subscribed && saved.token);
}

export async function disconnectMessengerPage(pageId: string) {
  await setSetting(connectionKey(pageId), null);
}

export async function messengerPageToken(pageId: string) {
  const saved = await getSetting<Connection | null>(connectionKey(pageId), null);
  return saved?.subscribed ? decryptToken(saved.token) : null;
}

export async function connectMessengerPage(pageId: string, token: string) {
  const [page] = await getDb().select({ id: facebookPages.id }).from(facebookPages).where(and(
    eq(facebookPages.platform, "facebook"), eq(facebookPages.facebookPageId, pageId), eq(facebookPages.isActive, true),
  )).limit(1);
  if (!page) return false;
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v23.0"}/${pageId}/subscribed_apps`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ subscribed_fields: "feed,messages,messaging_postbacks" }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { success?: boolean; error?: { message?: string } };
  if (!response.ok || !result.success) throw new Error(result.error?.message || "MESSENGER_SUBSCRIPTION_FAILED");
  await setSetting(connectionKey(pageId), { token: encryptToken(token), connectedAt: new Date().toISOString(), subscribed: true });
  return true;
}

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { getSetting, setSetting } from "./settings-store";
import { disconnectMessengerPage } from "./messenger-connection";

export type MetaAccountRecord = {
  id: string;
  name: string;
  pictureUrl?: string | null;
  permissions: string[];
  pageIds: string[];
  instagramIds: string[];
  connectedAt: string;
  lastConnectedAt: string;
  status: "active" | "needs_reauth" | "disconnected";
};

const KEY = "meta_accounts_v1";

function normalize(account: MetaAccountRecord): MetaAccountRecord {
  return {
    ...account,
    permissions: Array.from(new Set(account.permissions ?? [])).sort(),
    pageIds: Array.from(new Set(account.pageIds ?? [])),
    instagramIds: Array.from(new Set(account.instagramIds ?? [])),
  };
}

export async function listMetaAccounts() {
  const accounts = await getSetting<MetaAccountRecord[]>(KEY, []);
  if (accounts.length) return accounts.map(normalize);

  // Backward compatibility with the previous single-profile setting.
  const legacy = await getSetting<{ id: string; name: string; pictureUrl?: string | null; connectedAt?: string } | null>("meta_connected_profile", null);
  if (!legacy?.id || !legacy.name) return [];
  const connectedAt = legacy.connectedAt ?? new Date().toISOString();
  return [{
    id: legacy.id,
    name: legacy.name,
    pictureUrl: legacy.pictureUrl ?? null,
    permissions: [],
    pageIds: [],
    instagramIds: [],
    connectedAt,
    lastConnectedAt: connectedAt,
    status: "active" as const,
  }];
}

export async function upsertMetaAccount(input: {
  id: string;
  name: string;
  pictureUrl?: string | null;
  permissions: string[];
  pageIds: string[];
  instagramIds: string[];
}) {
  const now = new Date().toISOString();
  const accounts = await listMetaAccounts();
  const existing = accounts.find((account) => account.id === input.id);
  const next: MetaAccountRecord = normalize({
    id: input.id,
    name: input.name,
    pictureUrl: input.pictureUrl ?? null,
    permissions: input.permissions,
    pageIds: input.pageIds,
    instagramIds: input.instagramIds,
    connectedAt: existing?.connectedAt ?? now,
    lastConnectedAt: now,
    status: "active",
  });
  const merged = [...accounts.filter((account) => account.id !== input.id), next]
    .sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
  await setSetting(KEY, merged);

  // Keep the old key updated for compatibility with any older code paths.
  await setSetting("meta_connected_profile", {
    id: next.id,
    name: next.name,
    pictureUrl: next.pictureUrl ?? null,
    connectedAt: next.lastConnectedAt,
  });
  return next;
}

export async function markMetaAccountNeedsReauth(accountId: string) {
  const accounts = await listMetaAccounts();
  const next = accounts.map((account) => account.id === accountId ? { ...account, status: "needs_reauth" as const } : account);
  await setSetting(KEY, next);
}

export async function setMetaAccountDisconnected(accountId: string) {
  const accounts = await listMetaAccounts();
  const next = accounts.map((account) => account.id === accountId ? { ...account, status: "disconnected" as const } : account);
  await setSetting(KEY, next);
}


export async function disconnectMetaAccount(accountId: string) {
  const accounts = await listMetaAccounts();
  const target = accounts.find((account) => account.id === accountId);
  if (!target) throw new Error("META_ACCOUNT_NOT_FOUND");

  const otherActive = accounts.filter((account) => account.id !== accountId && account.status === "active");
  const sharedRemoteIds = new Set(
    otherActive.flatMap((account) => [...account.pageIds, ...account.instagramIds])
  );
  const ownedRemoteIds = [...target.pageIds, ...target.instagramIds];
  const exclusive = ownedRemoteIds.filter((id) => !sharedRemoteIds.has(id));

  if (exclusive.length) {
    await Promise.all(exclusive.map(disconnectMessengerPage));
    await getDb().update(facebookPages).set({
      isActive: false,
      status: "disconnected",
      accessTokenEnc: null,
      updatedAt: new Date(),
    }).where(and(
      inArray(facebookPages.facebookPageId, exclusive),
      eq(facebookPages.isActive, true),
    ));
  }

  const next = accounts.map((account) =>
    account.id === accountId ? { ...account, status: "disconnected" as const } : account
  );
  await setSetting(KEY, next);
  return {
    ok: true,
    disabledChannels: exclusive.length,
    preservedSharedChannels: ownedRemoteIds.length - exclusive.length,
  };
}

import { getSetting, setSetting } from "./settings-store";

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

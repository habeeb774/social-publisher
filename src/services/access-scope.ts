import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import type { CurrentUser } from "./rbac";
import { listMetaAccounts } from "./meta-accounts";
import { getSetting, setSetting } from "./settings-store";

export type UserAccessScope = {
  unrestricted: boolean;
  accountIds: string[];
  pageIds: string[];
};

const defaultScope = (): UserAccessScope => ({
  unrestricted: true,
  accountIds: [],
  pageIds: [],
});

const key = (userId: string) => `user_access_scope:${userId}`;

export async function getUserAccessScope(userId: string): Promise<UserAccessScope> {
  if (userId === "env-admin") return defaultScope();
  const raw = await getSetting<Partial<UserAccessScope>>(key(userId), {});
  return {
    unrestricted: raw.unrestricted ?? true,
    accountIds: Array.from(new Set((raw.accountIds ?? []).filter(Boolean))),
    pageIds: Array.from(new Set((raw.pageIds ?? []).filter(Boolean))),
  };
}

export async function setUserAccessScope(userId: string, scope: UserAccessScope) {
  const next: UserAccessScope = {
    unrestricted: Boolean(scope.unrestricted),
    accountIds: Array.from(new Set(scope.accountIds.filter(Boolean))),
    pageIds: Array.from(new Set(scope.pageIds.filter(Boolean))),
  };
  await setSetting(key(userId), next);
  return next;
}

export async function allowedPageIds(user: CurrentUser) {
  if (user.role === "admin" || user.id === "env-admin") return null;
  const scope = await getUserAccessScope(user.id);
  if (scope.unrestricted) return null;

  const ids = new Set(scope.pageIds);
  if (scope.accountIds.length) {
    const accounts = await listMetaAccounts();
    const remoteIds = accounts
      .filter((account) => scope.accountIds.includes(account.id))
      .flatMap((account) => [...account.pageIds, ...account.instagramIds]);
    if (remoteIds.length) {
      const rows = await getDb().select({ id: facebookPages.id })
        .from(facebookPages)
        .where(and(eq(facebookPages.isActive, true), inArray(facebookPages.facebookPageId, Array.from(new Set(remoteIds)))));
      for (const row of rows) ids.add(row.id);
    }
  }
  return ids;
}

export async function canAccessPage(user: CurrentUser, pageId: string) {
  const allowed = await allowedPageIds(user);
  return allowed === null || allowed.has(pageId);
}

export async function filterPageIdsForUser(user: CurrentUser, pageIds: string[]) {
  const allowed = await allowedPageIds(user);
  return allowed === null ? pageIds : pageIds.filter((id) => allowed.has(id));
}

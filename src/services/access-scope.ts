import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { currentUser, type CurrentUser } from "./rbac";
import { listMetaAccounts } from "./meta-accounts";
import { getSetting, setSetting } from "./settings-store";
import { parseUserAccessScope } from "./access-scope-model";

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
  const raw = await getSetting<unknown>(key(userId), defaultScope(), { strict: true });
  return parseUserAccessScope(raw);
}

export async function setUserAccessScope(userId: string, scope: UserAccessScope) {
  const next = parseUserAccessScope(scope);
  await setSetting(key(userId), next);
  return next;
}

export async function allowedPageIds(user: Pick<CurrentUser, "id" | "role">) {
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

export async function canAccessPage(user: Pick<CurrentUser, "id" | "role">, pageId: string) {
  const allowed = await allowedPageIds(user);
  return allowed === null || allowed.has(pageId);
}

export async function filterPageIdsForUser(user: Pick<CurrentUser, "id" | "role">, pageIds: string[]) {
  const allowed = await allowedPageIds(user);
  return allowed === null ? pageIds : pageIds.filter((id) => allowed.has(id));
}


export async function denyPageOutsideScope(request: NextRequest, pageId: string) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await canAccessPage(user, pageId)) return null;
  return NextResponse.json({ error: "ليست لديك صلاحية لهذه الصفحة", code: "PAGE_SCOPE_FORBIDDEN" }, { status: 403 });
}

export async function denyPostOutsideScope(request: NextRequest, postId: string) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [row] = await getDb().select({ pageId: posts.pageId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!row) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
  if (await canAccessPage(user, row.pageId)) return null;
  return NextResponse.json({ error: "ليست لديك صلاحية لهذا المنشور", code: "PAGE_SCOPE_FORBIDDEN" }, { status: 403 });
}

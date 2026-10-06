import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, users } from "@/db/schema";
import { PERMISSIONS, ROLE_LABELS } from "@/services/rbac";
import { pageCan, pageSession } from "@/services/session-server";
import { listMetaAccounts } from "@/services/meta-accounts";
import { getUserAccessScope } from "@/services/access-scope";
import { SettingsShell } from "../settings-shell";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "الفريق" };
const PERM_LABELS: Record<string, string> = {
  "content.read": "عرض المحتوى",
  "content.write": "إنشاء وتعديل",
  "content.publish": "نشر وجدولة",
  "content.review": "موافقة ورفض",
  "inbox.reply": "الرد على التعليقات",
  "inbox.manage": "إدارة صندوق الوارد",
  "automation.manage": "قواعد الأتمتة",
  "settings.manage": "الإعدادات",
  "users.manage": "إدارة الفريق",
  "data.export": "التصدير",
  "system.diagnose": "التشخيص",
};

export default async function Users() {
  const [canManage, session] = await Promise.all([pageCan("users.manage"), pageSession()]);
  const db = getDb();
  const rows = canManage
    ? await db.select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt }).from(users).orderBy(asc(users.createdAt)).limit(200).catch(() => [])
    : [];
  const [metaAccounts, pageRows, scopes] = canManage
    ? await Promise.all([
        listMetaAccounts(),
        db.select({ id: facebookPages.id, name: facebookPages.name, platform: facebookPages.platform }).from(facebookPages).where(eq(facebookPages.isActive, true)).orderBy(asc(facebookPages.name)).catch(() => []),
        Promise.all(rows.map((row) => getUserAccessScope(row.id))),
      ])
    : [[], [], []];

  const initial = rows.map((row, index) => ({
    ...row,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    scope: scopes[index],
  }));

  return <SettingsShell active="/settings/users" title="الحساب والفريق" description="أضف أعضاء الفريق وحدّد دور كل عضو والحسابات أو الصفحات التي يستطيع الوصول إليها.">
    <section className="card"><div className="card-header"><h2>حسابك</h2></div><div className="list"><div className="list-row"><span>الدور</span><b>{session ? ROLE_LABELS[session.role] : "—"}</b></div><div className="list-row"><span>نوع الحساب</span><span>{session?.userId === "env-admin" ? "المدير الأساسي (متغيرات البيئة)" : "عضو فريق"}</span></div></div></section>
    {canManage
      ? <UsersClient
          initial={initial}
          accounts={metaAccounts.map((account) => ({ id: account.id, name: account.name }))}
          pages={pageRows}
        />
      : <div className="alert alert-info">إدارة الفريق متاحة للمدير فقط.</div>}
    <section className="card card-flush"><div className="card-header" style={{ padding: "16px 20px 0" }}><h2>مصفوفة الصلاحيات</h2></div><div className="responsive-table"><table className="data-table"><thead><tr><th>الصلاحية</th>{(Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>).map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead><tbody>{Object.entries(PERMISSIONS).map(([perm, roles]) => <tr key={perm}><td>{PERM_LABELS[perm] ?? perm}</td>{(Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>).map((r) => <td key={r}>{(roles as readonly string[]).includes(r) ? <span className="badge badge-success">✓</span> : <span className="muted">—</span>}</td>)}</tr>)}</tbody></table></div></section>
  </SettingsShell>;
}

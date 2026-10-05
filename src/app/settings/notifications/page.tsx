import { ALERT_TYPES, defaultPref, type AlertPrefs, type AlertType } from "@/services/alerts";
import { approvalRequired } from "@/services/post-ops";
import { getSetting } from "@/services/settings-store";
import { AppShell } from "../../ui/app-shell";
import { PrefsClient } from "./prefs-client";

export const dynamic = "force-dynamic";
export default async function NotificationSettings() {
  const [prefs, approval] = await Promise.all([getSetting<AlertPrefs>("notification_prefs", {}), approvalRequired()]);
  const types = (Object.keys(ALERT_TYPES) as AlertType[]).map((key) => ({ key, label: ALERT_TYPES[key], defaults: defaultPref(key) }));
  return <AppShell title="إعدادات الإشعارات">
    <div className="page-intro"><div><h2>الإشعارات وسير العمل</h2><p>اختر الأحداث التي تريد أن تصلك وطريقة وصولها.</p></div></div>
    <PrefsClient types={types} initial={prefs as Record<string, { inApp: boolean; email: boolean }>} emailConfigured={Boolean(process.env.RESEND_API_KEY)} approvalRequired={approval} />
  </AppShell>;
}

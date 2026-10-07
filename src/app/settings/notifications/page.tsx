import { ALERT_TYPES, defaultPref, type AlertPrefs, type AlertType } from "@/services/alerts";
import { approvalRequired } from "@/services/post-ops";
import { getSetting } from "@/services/settings-store";
import { SettingsShell } from "../settings-shell";
import { PrefsClient } from "./prefs-client";
import { TestEmailButton } from "./test-email";
import { StatusLink } from "./status-link";
import { PushSettings } from "./push-settings";

export const dynamic = "force-dynamic";
export default async function NotificationSettings() {
  const [prefs, approval] = await Promise.all([getSetting<AlertPrefs>("notification_prefs", {}), approvalRequired()]);
  const types = (Object.keys(ALERT_TYPES) as AlertType[]).map((key) => ({ key, label: ALERT_TYPES[key], defaults: defaultPref(key) }));
  return <SettingsShell active="/settings/notifications" title="الإشعارات وسير العمل" description="اختر الأحداث التي تصلك وطريقة وصولها، وفعّل الموافقة قبل الجدولة.">
    <PrefsClient types={types} initial={prefs as Record<string, { inApp: boolean; email: boolean }>} emailConfigured={Boolean(process.env.RESEND_API_KEY)} approvalRequired={approval} />
    <PushSettings />
    <TestEmailButton />
    <StatusLink />
  </SettingsShell>;
}

import { SettingsShell } from "../settings-shell";
import { AppearanceClient } from "./appearance-client";

export const metadata = { title: "المظهر" };
export default function Appearance() {
  return <SettingsShell active="/settings/appearance" title="المظهر" description="تفضيلات العرض محفوظة على هذا الجهاز.">
    <AppearanceClient />
  </SettingsShell>;
}

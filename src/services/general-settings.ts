import { getSetting } from "./settings-store";

export type GeneralSettings = { systemName: string; defaultPageId: string | null; defaultPublishTime: string; systemEnabled: boolean; automationEnabled: boolean; publishingEnabled: boolean; politicsNewsEnabled: boolean; technologyNewsEnabled: boolean; commentsEnabled: boolean; messengerEnabled: boolean; contentEnabled: boolean; videoEnabled: boolean; integrationsEnabled: boolean };
export const DEFAULT_GENERAL: GeneralSettings = { systemName: "Social Publisher", defaultPageId: null, defaultPublishTime: "20:00", systemEnabled: true, automationEnabled: true, publishingEnabled: true, politicsNewsEnabled: true, technologyNewsEnabled: true, commentsEnabled: true, messengerEnabled: true, contentEnabled: true, videoEnabled: true, integrationsEnabled: true };
export async function getGeneralSettings(): Promise<GeneralSettings> {
  return { ...DEFAULT_GENERAL, ...await getSetting<Partial<GeneralSettings>>("general", {}).catch(() => ({})) };
}

import { getSetting } from "./settings-store";

export type GeneralSettings = { systemName: string; defaultPageId: string | null; defaultPublishTime: string };
export const DEFAULT_GENERAL: GeneralSettings = { systemName: "Social Publisher", defaultPageId: null, defaultPublishTime: "20:00" };
export async function getGeneralSettings(): Promise<GeneralSettings> {
  return { ...DEFAULT_GENERAL, ...await getSetting<Partial<GeneralSettings>>("general", {}).catch(() => ({})) };
}

import { getSetting } from "./settings-store";
import { DEFAULT_RULES, type PublishingRules } from "./publishing-rules";

export async function getPublishingRules(): Promise<PublishingRules> {
  const saved = await getSetting<Partial<PublishingRules>>("publishing_rules", {}).catch(() => ({} as Partial<PublishingRules>));
  return { ...DEFAULT_RULES, ...saved, window: { ...DEFAULT_RULES.window, ...saved.window } };
}

// Optional AI writing assistant. The system never depends on it: with no provider configured,
// the composer simply hides the AI buttons and every other feature keeps working.

import { AI_ACTIONS, type AiAction } from "./ai-actions";
export { AI_ACTIONS, type AiAction };

export interface AiProvider { name: string; run(action: AiAction, text: string): Promise<string> }

/** Anthropic Messages API provider, enabled only when ANTHROPIC_API_KEY is set. */
class AnthropicProvider implements AiProvider {
  name = "Claude";
  constructor(private key: string, private model = process.env.AI_MODEL || "claude-sonnet-5-5") {}
  async run(action: AiAction, text: string) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, system: "أنت محرر محتوى لصفحة Facebook عربية. التزم بالمعلومات الموجودة في النص فقط ولا تخترع أرقامًا أو وقائع. أعد النص الناتج فقط دون شرح.", messages: [{ role: "user", content: `${AI_ACTIONS[action].instruction}\n\nالنص:\n${text}` }] }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({})) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || `AI_PROVIDER_HTTP_${response.status}`);
    return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  }
}

export function getAiProvider(): AiProvider | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? new AnthropicProvider(key) : null;
}

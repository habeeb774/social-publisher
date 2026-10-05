"use client";
import { useState } from "react";
import { AI_ACTIONS, type AiAction } from "@/services/ai-actions";
import { api } from "../ui/api";

/** Rendered only when an AI provider is configured. Suggestions are shown for review; nothing is applied automatically. */
export function AiAssist({ text, onApply }: { text: string; onApply: (value: string, mode: "replace" | "append") => void }) {
  const [busy, setBusy] = useState<AiAction | null>(null);
  const [suggestion, setSuggestion] = useState<{ action: AiAction; text: string } | null>(null);
  const [error, setError] = useState("");
  async function run(action: AiAction) {
    setBusy(action); setError(""); setSuggestion(null);
    try { const r = await api<{ suggestion: string }>("/api/ai/assist", { method: "POST", body: { action, text } }); setSuggestion({ action, text: r.suggestion }); } catch (e) { setError(e instanceof Error ? e.message : "تعذر"); } finally { setBusy(null); }
  }
  const append = suggestion && (suggestion.action === "headline" || suggestion.action === "cta");
  return <div className="ai-assist"><span className="chips">{(Object.keys(AI_ACTIONS) as AiAction[]).map((a) => <button type="button" key={a} className="chip" disabled={!text.trim() || Boolean(busy)} onClick={() => run(a)}>{busy === a ? "…" : AI_ACTIONS[a].label}</button>)}</span>
    {error && <small role="alert">{error}</small>}
    {suggestion && <div className="version-body"><small>اقتراح ({AI_ACTIONS[suggestion.action].label}) — راجعه قبل الاستخدام:</small><p style={{ whiteSpace: "pre-wrap" }}>{suggestion.text}</p><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => { onApply(suggestion.text, append ? "append" : "replace"); setSuggestion(null); }}>{append ? "إضافة للنص" : "استبدال النص"}</button><button type="button" className="link-button" onClick={() => setSuggestion(null)}>تجاهل</button></div></div>}
  </div>;
}

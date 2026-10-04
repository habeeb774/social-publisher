"use client";
import { useState } from "react";

export function TestConnectionButton() {
  const [state, setState] = useState<string>("");
  async function test() {
    setState("جارٍ الاختبار...");
    const response = await fetch("/api/integrations/facebook/test", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
  setState(response.ok
    ? `نجح الاتصال — Organic: ${body.facebookOrganicConnected ? "متصل" : "غير متصل"} — الصفحة: ${body.pageAvailable ? "متاحة" : "غير متاحة"} — نص: ${body.capabilities?.publishText ? "متاح" : "غير متاح"} — صورة: ${body.capabilities?.publishPhoto ? "متاحة" : "غير متاحة"}`
    : `فشل الاختبار: ${body.status || "MCP_CONNECTION_FAILED"}`);
  }
  return <div className="stack"><button type="button" onClick={test}>اختبار الاتصال</button>{state && <p className="muted">{state}</p>}</div>;
}

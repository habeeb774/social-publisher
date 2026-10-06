import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const palettes = [
  ["#22d3ee", "#2563eb"],
  ["#38bdf8", "#7c3aed"],
  ["#2dd4bf", "#2563eb"],
  ["#60a5fa", "#a855f7"],
  ["#0ea5e9", "#14b8a6"],
];

export async function GET(_request: NextRequest, context: { params: Promise<{ index: string }> }) {
  const { index } = await context.params;
  const n = Math.max(1, Math.min(180, Number(index) || 1));
  const [accent, accent2] = palettes[(n - 1) % palettes.length];
  const nodes = Array.from({ length: 10 }, (_, i) => ({
    x: 10 + ((i * 23 + n * 7) % 78),
    y: 12 + ((i * 31 + n * 11) % 72),
    s: 7 + ((i + n) % 6),
  }));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(155deg,#050e1c 0%,#07172a 52%,#0a1730 100%)",
      }}
    >
      <div style={{ position: "absolute", width: 620, height: 620, borderRadius: 999, top: -150, left: -130, background: accent, opacity: 0.18, filter: "blur(10px)" }} />
      <div style={{ position: "absolute", width: 760, height: 760, borderRadius: 999, right: -260, bottom: -260, background: accent2, opacity: 0.2, filter: "blur(8px)" }} />
      <div style={{ position: "absolute", left: 110, right: 110, top: 200, bottom: 190, border: "1px solid rgba(255,255,255,.10)", borderRadius: 48, background: "rgba(255,255,255,.025)", display: "flex" }} />
      {nodes.map((node, i) => (
        <div key={i} style={{ position: "absolute", left: node.x + "%", top: node.y + "%", width: node.s * 3, height: node.s * 3, borderRadius: 999, background: i % 2 ? accent : accent2, boxShadow: `0 0 44px ${i % 2 ? accent : accent2}`, opacity: 0.85 }} />
      ))}
      {nodes.slice(1).map((node, i) => {
        const prev = nodes[Math.max(0, i - 1)];
        const left = Math.min(prev.x, node.x);
        const top = Math.min(prev.y, node.y);
        const width = Math.max(40, Math.abs(node.x - prev.x) * 10);
        const rotate = ((node.y - prev.y) / Math.max(1, node.x - prev.x)) * 12;
        return <div key={"l" + i} style={{ position: "absolute", left: left + "%", top: top + "%", width, height: 2, background: i % 2 ? accent : accent2, opacity: 0.18, transform: `rotate(${rotate}deg)`, transformOrigin: "left center" }} />;
      })}
      <div style={{ position: "absolute", left: 150, right: 150, bottom: 250, height: 210, display: "flex", gap: 28 }}>
        {[0,1,2].map((i) => <div key={i} style={{ flex: 1, borderRadius: 26, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)", display: "flex", flexDirection: "column", padding: 28, gap: 16 }}>
          <div style={{ width: "55%", height: 8, borderRadius: 99, background: i % 2 ? accent : accent2, opacity: .65 }} />
          <div style={{ width: "82%", height: 5, borderRadius: 99, background: "rgba(255,255,255,.14)" }} />
          <div style={{ width: "68%", height: 5, borderRadius: 99, background: "rgba(255,255,255,.09)" }} />
        </div>)}
      </div>
    </div>,
    {
      width: 1080,
      height: 1350,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}

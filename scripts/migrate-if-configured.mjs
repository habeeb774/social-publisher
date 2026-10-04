import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "[SENSITIVE]") {
  console.log("DATABASE_URL is not configured locally; skipping migrations.");
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["--yes", "drizzle-kit", "migrate"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);

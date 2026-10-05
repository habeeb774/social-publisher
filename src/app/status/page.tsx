import { runDiagnostics } from "@/services/diagnostics";
import { AppShell } from "../ui/app-shell";
import { StatusClient } from "./status-client";
import { CommentsHealth } from "../inbox/comments-health";

export const dynamic = "force-dynamic";
export default async function Status() {
  return <AppShell title="حالة النظام"><StatusClient initial={await runDiagnostics(false)} /><CommentsHealth/></AppShell>;
}

import { redirect } from "next/navigation";
import { pageSession } from "@/services/session-server";
import { AppShell } from "../../ui/app-shell";
import { CommentsClient } from "../../inbox/comments-client";

export default async function LegacyReplies() {
  if (await pageSession()) redirect("/templates/replies");
  return <AppShell title="قوالب الردود" commentsOnly><CommentsClient mode="templates" /></AppShell>;
}

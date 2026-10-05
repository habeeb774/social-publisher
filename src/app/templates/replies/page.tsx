import { AppShell } from "../../ui/app-shell";
import { CommentsClient } from "../../inbox/comments-client";

export const metadata = { title: "الردود الجاهزة" };
export default function ReplyTemplates() {
  return <AppShell title="الردود الجاهزة" parent={{ label: "صندوق الوارد", href: "/inbox" }}><CommentsClient mode="templates" /></AppShell>;
}

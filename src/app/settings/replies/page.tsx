import { AppShell } from "../../ui/app-shell";
import { CommentsClient } from "../../inbox/comments-client";
export default function Replies(){return <AppShell title="قوالب الردود" commentsOnly><CommentsClient mode="templates"/></AppShell>;}

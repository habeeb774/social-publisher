import { AppShell } from "../../ui/app-shell";
import { CommentsClient } from "../../inbox/comments-client";
export default function Analytics(){return <AppShell title="تحليلات التعليقات" commentsOnly><CommentsClient mode="analytics"/></AppShell>;}

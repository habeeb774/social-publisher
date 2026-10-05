import { AppShell } from "../../ui/app-shell";
import { CommentsClient } from "../../inbox/comments-client";
export default function Automations(){return <AppShell title="أتمتة التعليقات" commentsOnly><CommentsClient mode="rules"/></AppShell>;}

import { AppShell } from "../ui/app-shell";
import { CommentsClient } from "./comments-client";
export default function Inbox(){return <AppShell title="صندوق الوارد" commentsOnly><CommentsClient/></AppShell>;}

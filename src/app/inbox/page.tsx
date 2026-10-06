import Link from "next/link";
import { Suspense } from "react";
import { pageCan, pageSession } from "@/services/session-server";
import { CommentsClient } from "./comments-client";
import { AppShell } from "../ui/app-shell";
import { PageHeader, Skeleton } from "../ui/kit";
import { UnifiedInboxClient } from "./unified-inbox-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "صندوق الوارد" };

export default async function Inbox() {
  // Comments-team members sign in separately (/comments/login) and get the comments-only workspace.
  if (!await pageSession()) return <AppShell title="صندوق الوارد" commentsOnly><CommentsClient /></AppShell>;
  const canReply = await pageCan("inbox.reply");
  return <AppShell title="صندوق الوارد">
    <PageHeader title="صندوق الوارد" description="التعليقات ورسائل Messenger في مركز واحد، مع فلترة حسب حساب Meta والصفحة." actions={<><Link className="btn btn-secondary btn-sm" href="/inbox/messages">Messenger فقط</Link><Link className="btn btn-secondary btn-sm" href="/templates/replies">الردود الجاهزة</Link><Link className="btn btn-secondary btn-sm" href="/automations/comments">الأتمتة</Link><Link className="btn btn-ghost btn-sm" href="/analytics/comments">تحليلات التعليقات</Link></>} />
    <Suspense fallback={<Skeleton lines={6} />}><UnifiedInboxClient canReply={canReply} /></Suspense>
  </AppShell>;
}

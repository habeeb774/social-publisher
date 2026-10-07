import Link from "next/link";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
import { MessengerRulesClient } from "./messenger-rules-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "أتمتة Messenger" };

export default async function MessengerAutomationPage() {
  const canManage = await pageCan("automation.manage");
  return <AppShell title="أتمتة Messenger">
    <PageHeader
      title="أتمتة Messenger"
      description="قواعد آمنة للردود المقترحة أو التلقائية على رسائل صفحات Facebook."
      actions={<Link className="btn btn-secondary btn-sm" href="/inbox/messages">العودة إلى Messenger</Link>}
    />
    {canManage
      ? <MessengerRulesClient />
      : <div className="alert alert-info">إدارة أتمتة Messenger متاحة للمدير فقط.</div>}
  </AppShell>;
}

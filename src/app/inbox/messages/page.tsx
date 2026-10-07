import Link from "next/link";
import { pageCan } from "@/services/session-server";
import { AppShell } from "../../ui/app-shell";
import { PageHeader } from "../../ui/kit";
import { MessagesClient } from "./messages-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "رسائل ماسنجر" };

export default async function Messages() {
  const canReply = await pageCan("inbox.reply");
  const canManage = await pageCan("settings.manage");
  return <AppShell title="رسائل ماسنجر">
    <PageHeader title="رسائل ماسنجر" description="رسائل صفحاتك الخاصة في مكان واحد. الرد متاح خلال 24 ساعة من آخر رسالة للعميل." actions={<>{canManage && <Link className="btn btn-secondary btn-sm" href="/pages">تفعيل Messenger</Link>}<Link className="btn btn-secondary btn-sm" href="/automations/messenger">أتمتة Messenger</Link></>} />
    <MessagesClient canReply={canReply} />
  </AppShell>;
}

import { getPublishingRules } from "@/services/rules-store";
import { AppShell } from "../../ui/app-shell";
import { RulesClient } from "./rules-client";

export const dynamic = "force-dynamic";
export default async function PublishingRules() {
  return <AppShell title="قواعد النشر">
    <div className="page-intro"><div><h2>أوقات وأيام النشر</h2><p>حدّد متى لا يجب أن يُنشر المحتوى (توقيت الرياض).</p></div></div>
    <RulesClient initial={await getPublishingRules()} />
  </AppShell>;
}

import { redirect } from "next/navigation";
import { pageSession } from "@/services/session-server";
import { AppShell } from "../ui/app-shell";
import { MoviesClient } from "./movies-client";
import { can } from "@/services/rbac";
import { allowedPageIds } from "@/services/access-scope";
import { editorData } from "../posts/editor-data";
import styles from "./movies.module.css";
import {YouTubeConnection} from "./youtube-panel";
import {MoviePublishingControls} from "./publishing-controls";
export const dynamic = "force-dynamic";
export default async function MoviesPage() {
  const session=await pageSession();
  if (!session) redirect("/login");
  const enabled=process.env.MOVIE_REELS_ENABLED==="true";
  const data=enabled?await editorData(await allowedPageIds({id:session.userId,role:session.role})):null;
  return <AppShell title="ناشر الأفلام"><main className={`stack ${styles.page}`}>
    <h1>ناشر الأفلام والريلز</h1>
    <p>30 ثانية لكل ريل · 5 ريلز يوميًا · ترجمة تلقائية · ترقيم الأجزاء</p>
    {enabled?<><MoviePublishingControls canManage={can(session.role,"settings.manage")}/><YouTubeConnection canManage={can(session.role,"settings.manage")}/></>:null}
    <MoviesClient enabled={enabled} canWrite={can(session.role,"content.write")} canReview={can(session.role,"content.review")} canPublish={can(session.role,"content.publish")} canDelete={session.role==="admin"} pages={(data?.pages??[]).filter(page=>page.platform==="facebook").map(page=>({id:page.id,name:page.name}))}/>
  </main></AppShell>;
}

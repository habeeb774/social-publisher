import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages } from "@/db/schema";
import { isPublishingEnabled } from "@/services/publishing-mode";
import PostEditor from "../post-editor";
export const dynamic="force-dynamic";
export default async function NewPost() {
  const pages=await getDb().select({id:facebookPages.id,name:facebookPages.name}).from(facebookPages).where(eq(facebookPages.isActive,true));
  return <PostEditor pages={pages} publishingEnabled={isPublishingEnabled()}/>;
}

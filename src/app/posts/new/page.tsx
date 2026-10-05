import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { mediaAssets, postTemplates } from "@/db/schema";
import PostEditor from "../post-editor";
import { editorData } from "../editor-data";
export const dynamic = "force-dynamic";

/** Supports ?template=<id> and ?media=<id> to start from a template or a library image. */
export default async function NewPost({ searchParams }: { searchParams: Promise<{ template?: string; media?: string }> }) {
  const params = await searchParams;
  const db = getDb();
  const [data, template, asset] = await Promise.all([
    editorData(),
    z.uuid().safeParse(params.template).success ? db.select().from(postTemplates).where(eq(postTemplates.id, params.template!)).limit(1) : Promise.resolve([]),
    z.uuid().safeParse(params.media).success ? db.select().from(mediaAssets).where(and(eq(mediaAssets.id, params.media!), isNull(mediaAssets.deletedAt))).limit(1) : Promise.resolve([]),
  ]);
  const defaults = (template[0]?.defaultSettings ?? {}) as { category?: string; tags?: string[] };
  return <PostEditor {...data} prefill={{ content: template[0]?.content, imageUrl: asset[0]?.url, category: defaults.category, tags: defaults.tags }} />;
}

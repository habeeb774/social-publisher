import EditPostClient from "./edit-post-client";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPostClient id={id} />;
}

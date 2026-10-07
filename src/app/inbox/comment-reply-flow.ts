type Action = "draft" | "approve" | "send";
type Result = { id?: string; dryRun?: boolean; realReply?: boolean; facebookReplyId?: string };
export type CommentReplyRequest = (body: { action: Action; id: string; content?: string; templateId?: null; replyId?: string }) => Promise<Result>;

/** The API still authorizes every action; this capability only shapes the UI flow. */
export async function commentReplyFlow(request: CommentReplyRequest, id: string, content: string, canApprove: boolean) {
  const draft = await request({ action: "draft", id, content: content.trim(), templateId: null });
  if (!draft.id) throw new Error("تعذر تأكيد حفظ المسودة.");
  if (!canApprove) return "draft" as const;
  await request({ action: "approve", id, replyId: draft.id });
  const sent = await request({ action: "send", id, replyId: draft.id });
  if (sent.dryRun === true && sent.realReply !== true) return "dry_run" as const;
  if (sent.dryRun === false && sent.realReply === true && sent.facebookReplyId) return "sent" as const;
  throw new Error("لم يتأكد إرسال الرد. راجع حالة المسودة قبل إعادة المحاولة.");
}

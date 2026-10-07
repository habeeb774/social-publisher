import { test } from "node:test";
import assert from "node:assert/strict";
import { commentReplyFlow, savedCommentReply, type CommentReplyRequest } from "../src/app/inbox/comment-reply-flow";

test("editor saves a draft without attempting approval or sending", async () => {
  const actions: string[] = [];
  const request: CommentReplyRequest = async (body) => { actions.push(body.action); assert.equal(body.content, "مرحبا"); return { id: "reply" }; };
  assert.equal(await commentReplyFlow(request, "comment", " مرحبا ", false), "draft");
  assert.deepEqual(actions, ["draft"]);
});

test("admin flow distinguishes a dry run from confirmed delivery", async () => {
  for (const dryRun of [true, false]) {
    const actions: string[] = [];
    const request: CommentReplyRequest = async (body) => {
      actions.push(body.action);
      if (body.action === "draft") return { id: "reply" };
      assert.equal(body.replyId, "reply");
      return body.action === "send" ? { dryRun, realReply: !dryRun, ...(dryRun ? {} : { facebookReplyId: "provider-id" }) } : {};
    };
    assert.equal(await commentReplyFlow(request, "comment", "مرحبا", true), dryRun ? "dry_run" : "sent");
    assert.deepEqual(actions, ["draft", "approve", "send"]);
  }
});

test("unconfirmed delivery is never reported as success or automatically retried", async () => {
  let sends = 0;
  await assert.rejects(commentReplyFlow(async (body) => {
    if (body.action === "draft") return { id: "reply" };
    if (body.action === "send") sends++;
    return {};
  }, "comment", "مرحبا", true), /لم يتأكد إرسال/);
  assert.equal(sends, 1);
});

test("failed approval never proceeds to send", async () => {
  const actions: string[] = [];
  await assert.rejects(commentReplyFlow(async (body) => {
    actions.push(body.action);
    if (body.action === "draft") return { id: "reply" };
    throw new Error("الدور لا يسمح بهذا الإجراء");
  }, "comment", "مرحبا", true));
  assert.deepEqual(actions, ["draft", "approve"]);
});

test("saved draft approval preserves identity and never creates or sends a reply", async () => {
  const calls: unknown[] = [];
  const result = await savedCommentReply(async (body) => { calls.push(body); return {}; }, "comment", { id: "existing", status: "draft" }, "approve");
  assert.equal(result, "approved");
  assert.deepEqual(calls, [{ action: "approve", id: "comment", replyId: "existing" }]);
});

test("only approved saved replies can be sent, and dry runs remain unsent", async () => {
  const calls: unknown[] = [];
  const request: CommentReplyRequest = async (body) => { calls.push(body); return { dryRun: true, realReply: false }; };
  for (const status of ["draft", "pending_approval", "sent", "sending", "failed", "outcome_unknown"]) {
    await assert.rejects(savedCommentReply(request, "comment", { id: "existing", status }, "send"));
  }
  assert.equal(calls.length, 0);
  assert.equal(await savedCommentReply(request, "comment", { id: "existing", status: "approved" }, "send"), "dry_run");
  assert.deepEqual(calls, [{ action: "send", id: "comment", replyId: "existing" }]);
});

import { NextResponse } from "next/server";

/** Never accept raw exception data: database errors can contain query parameters. */
export function postRetryUnavailable() {
  console.error("Post retry unavailable", { code: "POST_RETRY_UNAVAILABLE" });
  return NextResponse.json({
    error: "تعذر إعادة المحاولة. حدّث حالة المنشور قبل المحاولة مجددًا.",
    code: "POST_RETRY_UNAVAILABLE",
  }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}

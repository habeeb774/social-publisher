import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { guard } from "@/services/api-guard";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/services/media-kind";

/**
 * Issues a short-lived token so the browser uploads a video straight to Vercel Blob.
 * Videos exceed the request-body limit of a server route, so the file never passes through here.
 */
export async function POST(request: NextRequest) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      request, body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("media/videos/") || !/\.(?:mp4|mov|m4v)$/i.test(pathname)) throw new Error("نوع الفيديو غير مدعوم");
        return { allowedContentTypes: VIDEO_TYPES, maximumSizeInBytes: VIDEO_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تجهيز رفع الفيديو" }, { status: 400 });
  }
}

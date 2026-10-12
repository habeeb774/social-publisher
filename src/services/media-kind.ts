/** Video formats Facebook Page videos and Instagram Reels both accept. */
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

/** A post's media URL is a video when it points at an MP4/MOV file. */
export function isVideoUrl(url: string | null | undefined) {
  return !!url && /\.(?:mp4|mov|m4v)(?:$|[?#])/i.test(url);
}

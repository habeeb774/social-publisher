/** Repair only generated images from our retired deployment, never arbitrary external URLs. */
export function resolveMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "social-publisher-gamma.vercel.app" || url.username || url.password || url.port) return value;
    if (!/^\/api\/(?:campaign-image\/\d+|(?:tech|politics)-news-image\/[a-zA-Z0-9-]+)$/.test(url.pathname)) return value;
    url.hostname = "sp.leanpix.site";
    return url.toString();
  } catch { return value; }
}

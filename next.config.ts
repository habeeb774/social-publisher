import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The scheduler renders news Reels with the bundled FFmpeg binary; keep it out of the bundle
  // and make sure the file ships with the function.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/cron/publish": ["./node_modules/ffmpeg-static/ffmpeg*"] },
};

export default nextConfig;

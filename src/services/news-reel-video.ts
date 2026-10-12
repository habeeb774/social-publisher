import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const SECONDS = 6;

/**
 * Turns a vertical 1080x1920 PNG card into a short MP4 for Reels: fade-in plus a slow zoom,
 * H.264/AAC with a silent audio track (no music, to avoid copyright claims).
 */
export async function renderNewsReel(card: Buffer) {
  if (!ffmpegPath) throw new Error("FFMPEG_UNAVAILABLE: لا يتوفر FFmpeg على هذا الخادم");
  const dir = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    const input = join(dir, "card.png"), output = join(dir, "reel.mp4");
    await writeFile(input, card);
    const frames = SECONDS * 30;
    await run(ffmpegPath, [
      "-y", "-loop", "1", "-framerate", "30", "-i", input,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex", `[0:v]scale=1188:2112,zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,fade=t=in:st=0:d=0.6,format=yuv420p[v]`,
      "-map", "[v]", "-map", "1:a", "-t", String(SECONDS),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", output,
    ], { timeout: 30000 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import argparse
import json
import subprocess
from pathlib import Path
from plan_clips import plan

def render(source: Path, output_dir: Path, limit: int = 5):
    if not source.is_file() or not 1 <= limit <= 100:
        raise ValueError("Invalid source or limit")
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for clip in plan(source)[:limit]:
        target = output_dir / f"part-{clip['part']:03d}.mp4"
        if target.exists():
            raise FileExistsError(target)
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
            "-ss", str(clip["start_seconds"]), "-t", "30",
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-crf", "23", "-c:a", "aac", str(target)],
            check=True, timeout=900)
        outputs.append({"part": clip["part"], "path": str(target), "status": "review_required"})
    return outputs

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(render(args.source, args.output_dir, args.limit)))

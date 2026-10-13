import argparse
import json
import hashlib
import os
import subprocess
from pathlib import Path
from plan_clips import plan, scene_boundaries

def validate_output(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True, check=True, timeout=30)
        info = json.loads(result.stdout)
        video = next(s for s in info["streams"] if s.get("codec_type") == "video")
        return video.get("codec_name") == "h264" and video.get("width") == 1080 and video.get("height") == 1920 and abs(float(info["format"]["duration"]) - 30) < .15
    except (subprocess.SubprocessError, ValueError, KeyError, OSError, StopIteration):
        return False

def source_hash(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def render(source: Path, output_dir: Path, limit: int = 5):
    output_dir.mkdir(parents=True, exist_ok=True)
    lock = output_dir / ".render.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    try:
        return render_locked(source, output_dir, limit)
    finally:
        lock.unlink(missing_ok=True)

def render_locked(source: Path, output_dir: Path, limit: int = 5):
    if not source.is_file() or not 1 <= limit <= 100:
        raise ValueError("Invalid source or limit")
    output_dir.mkdir(parents=True, exist_ok=True)
    # Bind cached previews to their source and immutable scene-aware plan.
    manifest = output_dir / "manifest.json"
    digest = source_hash(source)
    if manifest.exists():
        saved = json.loads(manifest.read_text(encoding="utf-8"))
        if saved["source_sha256"] != digest:
            raise ValueError("Output directory belongs to another source")
        clips = saved["clips"]
    else:
        clips = plan(source, scene_boundaries(source))
        temporary = output_dir / "manifest.partial.json"
        temporary.write_text(json.dumps({"source_sha256": digest, "clips": clips}), encoding="utf-8")
        temporary.replace(manifest)
    outputs = []
    for clip in clips[:limit]:
        target = output_dir / f"part-{clip['part']:03d}.mp4"
        if target.exists():
            if not validate_output(target):
                raise ValueError(f"Invalid existing output: {target.name}")
            outputs.append({"part": clip["part"], "path": str(target), "status": "review_required"})
            continue
        partial = output_dir / f"part-{clip['part']:03d}.partial.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(source),
            "-ss", str(clip["start_seconds"]), "-t", "30",
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-movflags", "+faststart", str(partial)],
            check=True, timeout=900)
        if not validate_output(partial):
            raise ValueError("Rendered output failed validation")
        partial.replace(target)
        outputs.append({"part": clip["part"], "path": str(target), "status": "review_required"})
    return outputs

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    print(json.dumps(render(args.source, args.output_dir, args.limit)))

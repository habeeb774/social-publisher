#!/usr/bin/env python3
"""Offline movie clip planner. No uploads, publishing or external network access."""
from __future__ import annotations
import json
import math
import re
import subprocess
import sys
from pathlib import Path

CLIP_SECONDS = 30
MAX_CLIPS_PER_DAY = 5

def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True, timeout=120,
    )
    return float(result.stdout.strip())

def scene_boundaries(path: Path) -> list[float]:
    result = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(path), "-an", "-vf", "scale=320:-2,select='gt(scene,0.35)',showinfo", "-f", "null", "-"], capture_output=True, text=True, check=True, timeout=7200)
    return sorted({float(value) for value in re.findall(r"pts_time:([0-9.]+)", result.stderr)})

def plan(path: Path, scenes: list[float] | None = None) -> list[dict[str, float | int]]:
    duration = duration_seconds(path)
    if not math.isfinite(duration) or duration < CLIP_SECONDS:
        return []
    boundaries = sorted({float(s) for s in scenes or [] if math.isfinite(s) and 0 <= s <= duration})
    clips = []
    cursor = 0.0
    while cursor + CLIP_SECONDS <= duration:
        candidates = [s for s in boundaries if cursor <= s <= cursor + 3 and s + CLIP_SECONDS <= duration]
        start = candidates[0] if candidates else cursor
        clips.append({"part": len(clips) + 1, "start_seconds": start, "duration_seconds": CLIP_SECONDS})
        cursor = start + CLIP_SECONDS
    return clips

if __name__ == "__main__":
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_file():
        raise SystemExit("Usage: python plan_clips.py /path/to/licensed-video.mp4")
    print(json.dumps({"status": "planning_only", "daily_limit": MAX_CLIPS_PER_DAY,
                      "clips": plan(Path(sys.argv[1]))}, ensure_ascii=False))

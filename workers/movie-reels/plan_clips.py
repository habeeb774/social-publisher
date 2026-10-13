#!/usr/bin/env python3
"""Offline movie clip planner. No uploads, publishing or external network access."""
from __future__ import annotations
import json
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

def plan(path: Path) -> list[dict[str, int]]:
    duration = duration_seconds(path)
    return [
        {"part": i + 1, "start_seconds": i * CLIP_SECONDS,
         "duration_seconds": min(CLIP_SECONDS, int(duration - i * CLIP_SECONDS))}
        for i in range(int(duration // CLIP_SECONDS))
    ]

if __name__ == "__main__":
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_file():
        raise SystemExit("Usage: python plan_clips.py /path/to/licensed-video.mp4")
    print(json.dumps({"status": "planning_only", "daily_limit": MAX_CLIPS_PER_DAY,
                      "clips": plan(Path(sys.argv[1]))}, ensure_ascii=False))

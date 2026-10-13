"""Revision-addressed subtitle burn-in. Outputs always require another human review."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from render import source_hash, validate_output
from subtitles import to_srt, validate_cues

def burn(source: Path, cues: list[dict], part: int, output_dir: Path, font: Path) -> dict:
    if not isinstance(part, int) or isinstance(part, bool) or part < 1:
        raise ValueError("Invalid part")
    if not validate_output(source) or not font.is_file():
        raise ValueError("A validated reel and Arabic font are required")
    cues = validate_cues(cues, 30)
    # Full revision hash includes the input video, edited text, timing and font.
    revision = hashlib.sha256(json.dumps({"source":source_hash(source),"font":source_hash(font),"cues":cues,"part":part,"style":2}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"part-{part:03d}-{revision}.mp4"
    if target.exists():
        if not validate_output(target):
            raise ValueError("Invalid cached subtitled reel")
        return {"path":str(target),"revision":revision,"status":"review_required"}
    # Private temp workspace uses constant filenames in filters, preventing
    # arbitrary caption text or Windows paths from becoming filter expressions.
    with tempfile.TemporaryDirectory(prefix="reel-captions-", dir=output_dir) as directory:
        work = Path(directory)
        shutil.copyfile(font, work / "font.ttf")
        (work / "captions.srt").write_text(to_srt(cues), encoding="utf-8")
        part_ass = "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Tajawal,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,8,40,40,120,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        part_ass += f"Dialogue: 0,0:00:00.00,0:00:30.00,Default,,0,0,0,,الجزء {part}\n"
        (work / "part.ass").write_text(part_ass, encoding="utf-8")
        filters = "subtitles=captions.srt:fontsdir=.:force_style='FontName=Tajawal,FontSize=16,Alignment=2,MarginV=52,Outline=2'"
        filters += ",ass=part.ass:fontsdir=."
        if not cues:
            filters = "ass=part.ass:fontsdir=."
        partial = work / "output.mp4"
        subprocess.run(["ffmpeg","-nostdin","-v","error","-i",str(source.resolve()),"-vf",filters,"-c:v","libx264","-preset","fast","-crf","23","-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",str(partial.resolve())], cwd=work, check=True, timeout=1800)
        if not validate_output(partial):
            raise ValueError("Subtitle render failed output validation")
        # A separate revision never overwrites the reviewed input MP4.
        partial.replace(target)
    return {"path":str(target),"revision":revision,"status":"review_required"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("captions", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--part", type=int, required=True)
    parser.add_argument("--font", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(burn(args.source, json.loads(args.captions.read_text(encoding="utf-8"))["cues"], args.part, args.output_dir, args.font)))

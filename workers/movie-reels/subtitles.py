"""Local transcription and editable timed captions; never sends movie audio to an API."""
import argparse
import json
import math
from pathlib import Path

def validate_cues(cues: list[dict], duration: float) -> list[dict]:
    if not math.isfinite(duration) or duration <= 0 or len(cues) > 100000:
        raise ValueError("Invalid subtitle duration or count")
    validated = []
    previous_end = 0.0
    for cue in cues:
        start, end = float(cue["start"]), float(cue["end"])
        text = str(cue["text"]).strip()
        if not all(math.isfinite(v) for v in [start, end]) or start < previous_end or end <= start or end > duration or not text or len(text) > 2000:
            raise ValueError("Invalid or overlapping subtitle cue")
        validated.append({"start": start, "end": end, "text": text})
        previous_end = end
    return validated

def clip_cues(cues: list[dict], start: float, duration: float = 30) -> list[dict]:
    if not math.isfinite(start) or start < 0 or duration <= 0 or not math.isfinite(duration):
        raise ValueError("Invalid clip interval")
    return [{"start": max(cue["start"], start) - start,
             "end": min(cue["end"], start + duration) - start,
             "text": cue["text"]}
            for cue in cues if cue["end"] > start and cue["start"] < start + duration]

# Must match workerCaptionSchema in src/services/movie-reels/pipeline.ts.
SERVER_MAX_CUE_CHARS = 300
SERVER_MAX_CUES = 200

def fit_server_limits(cues: list[dict]) -> list[dict]:
    """Splits long cues at word boundaries (time shared by length) and caps the cue count."""
    fitted = []
    for cue in cues:
        words, chunks, current = " ".join(str(cue["text"]).split()).split(" "), [], ""
        for word in words:
            while len(word) > SERVER_MAX_CUE_CHARS:
                if current:
                    chunks.append(current)
                    current = ""
                chunks.append(word[:SERVER_MAX_CUE_CHARS])
                word = word[SERVER_MAX_CUE_CHARS:]
            candidate = f"{current} {word}".strip()
            if len(candidate) > SERVER_MAX_CUE_CHARS:
                chunks.append(current)
                current = word
            else:
                current = candidate
        if current:
            chunks.append(current)
        start, span, total = float(cue["start"]), float(cue["end"]) - float(cue["start"]), sum(len(c) for c in chunks)
        for chunk in chunks:
            end = min(float(cue["end"]), start + span * len(chunk) / total)
            if end > start:
                fitted.append({"start": start, "end": end, "text": chunk})
            start = end
    return fitted[:SERVER_MAX_CUES]

def timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def to_srt(cues: list[dict], duration: float = 30) -> str:
    cues = validate_cues(cues, duration)
    # Strip blank lines and SRT control arrows from freeform edited text.
    return "\n\n".join(f"{index}\n{timestamp(cue['start'])} --> {timestamp(cue['end'])}\n" + " ".join(cue["text"].replace("-->", "→").split()) for index, cue in enumerate(cues, 1)) + ("\n" if cues else "")

def transcribe(source: Path, model_dir: Path, duration: float, language: str | None = None) -> list[dict]:
    if not source.is_file() or not model_dir.is_dir():
        raise ValueError("Source and local Whisper model directory are required")
    from faster_whisper import WhisperModel
    model = WhisperModel(str(model_dir), device="cpu", compute_type="int8", local_files_only=True)
    segments, _info = model.transcribe(str(source), language=language, vad_filter=True, beam_size=5)
    cues = []
    for segment in segments:
        start = max(0, float(segment.start))
        end = min(duration, float(segment.end))
        if end > start and segment.text.strip():
            cues.append({"start": start, "end": end, "text": segment.text.strip()})
    return validate_cues(cues, duration)

def write_atomic(path: Path, content: str):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--language")
    args = parser.parse_args()
    from plan_clips import duration_seconds
    from render import source_hash
    cues = transcribe(args.source, args.model_dir, duration_seconds(args.source), args.language)
    write_atomic(args.output, json.dumps({"source_sha256":source_hash(args.source),"cues": cues, "review_required": True}, ensure_ascii=False))

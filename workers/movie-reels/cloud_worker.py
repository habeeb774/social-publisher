"""Leased cloud worker: pulls jobs from the app, renders with FFmpeg, uploads to signed private URLs.

Never publishes and never approves. Talks only to MOVIE_API_URL (bearer MOVIE_WORKER_SECRET)
and to the short-lived signed storage URLs that API returns.
"""
from __future__ import annotations
import json
import os
import shutil
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from burn_subtitles import burn
from render import RenderBusy, render
from subtitles import fit_server_limits

CHUNK = 8 * 1024 * 1024
REPORT_BATCH = 10

class LeaseLost(Exception):
    pass

class Permanent(Exception):
    """Input problems that a retry cannot fix (bad source, invalid captions)."""

class Api:
    def __init__(self, base: str, secret: str, opener=urllib.request.urlopen, allow_insecure: bool | None = None):
        # Plain http only for loopback, or for local dev (e.g. host.docker.internal) when MOVIE_ALLOW_INSECURE_API=1.
        if allow_insecure is None:
            allow_insecure = os.environ.get("MOVIE_ALLOW_INSECURE_API") == "1"
        local = base.startswith("http://127.0.0.1") or base.startswith("http://localhost")
        if not base.startswith("https://") and not local and not (allow_insecure and base.startswith("http://")):
            raise ValueError("MOVIE_API_URL must use https")
        if len(secret) < 32:
            raise ValueError("MOVIE_WORKER_SECRET must be at least 32 characters")
        self.url = base.rstrip("/") + "/api/movies/worker"
        self.secret = secret
        self.open = opener

    def call(self, action: str, **payload) -> dict:
        body = json.dumps({"action": action, **payload}, ensure_ascii=False).encode()
        request = urllib.request.Request(self.url, data=body, method="POST", headers={"Authorization": f"Bearer {self.secret}", "Content-Type": "application/json"})
        try:
            with self.open(request, timeout=120) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            detail = json.loads(error.read() or b"{}").get("error", "")
            if error.code == 409 and detail == "LEASE_LOST":
                raise LeaseLost() from error
            if 400 <= error.code < 500 and error.code not in (408, 429):
                # The server rejected this exact request; repeating it cannot succeed.
                raise Permanent(f"API {action} rejected: {error.code} {detail}") from error
            raise RuntimeError(f"API {action} failed: {error.code} {detail}") from error

def download(url: str, target: Path, opener=urllib.request.urlopen):
    if target.exists():
        return target
    partial = target.with_suffix(target.suffix + ".partial")
    with opener(urllib.request.Request(url), timeout=600) as response, partial.open("wb") as handle:
        shutil.copyfileobj(response, handle, CHUNK)
    partial.replace(target)
    return target

SAMPLE = 1024 * 1024

def remote_range(url: str, start: int, length: int, opener=urllib.request.urlopen) -> bytes:
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{start + length - 1}"})
    with opener(request, timeout=120) as response:
        return response.read(length + 1)

def local_source(job: dict, folders: list[Path], opener=urllib.request.urlopen) -> Path | None:
    """Reuse the uploader's original file when it exists locally: same name, same size and identical
    sampled byte ranges (start, middle, end) as the stored object. Any mismatch falls back to download."""
    name, size = job.get("sourceName"), job.get("sourceSize")
    if not name or not isinstance(size, int) or size <= 0 or Path(name).name != name:
        return None
    for folder in folders:
        candidate = folder / name
        if not candidate.is_file() or candidate.stat().st_size != size:
            continue
        try:
            with candidate.open("rb") as handle:
                for start in sorted({0, max(0, size // 2 - SAMPLE // 2), max(0, size - SAMPLE)}):
                    length = min(SAMPLE, size - start)
                    handle.seek(start)
                    if handle.read(length) != remote_range(job["sourceUrl"], start, length, opener):
                        break
                else:
                    return candidate
        except (OSError, urllib.error.URLError):
            continue
    return None

def local_source_folders() -> list[Path]:
    return [Path(item) for item in os.environ.get("MOVIE_LOCAL_SOURCE_DIRS", "").split(os.pathsep) if item.strip()]

def upload(url: str, path: Path, opener=urllib.request.urlopen):
    size = path.stat().st_size
    with path.open("rb") as handle:
        request = urllib.request.Request(url, data=handle, method="PUT", headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
        with opener(request, timeout=900) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError("Clip upload failed")

class Heartbeat:
    def __init__(self, api: Api, job: dict, every: int = 240):
        self.api, self.job, self.every = api, job, every
        self.progress = 1
        self.lost = False
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        while not self.stop.wait(self.every):
            try:
                self.api.call("heartbeat", jobId=self.job["id"], leaseToken=self.job["leaseToken"], progress=self.progress)
            except LeaseLost:
                self.lost = True
                return
            except Exception:
                continue

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()

    def check(self):
        if self.lost:
            raise LeaseLost()

def lease_args(job: dict) -> dict:
    return {"jobId": job["id"], "leaseToken": job["leaseToken"]}

def process(api: Api, job: dict, work: Path, font: Path, model_dir: Path | None, beat: Heartbeat, opener=urllib.request.urlopen):
    movie_dir = work / job["movieId"]
    movie_dir.mkdir(parents=True, exist_ok=True)
    source = local_source(job, local_source_folders(), opener)
    if source:
        print(json.dumps({"job": job["id"], "status": "using_local_source"}))
    else:
        source = download(job["sourceUrl"], movie_dir / "source.video", opener)
    beat.progress = 10
    try:
        outputs = render(source, movie_dir / "clips", limit=1000, model_dir=model_dir, check=beat.check)
    except ValueError as error:
        raise Permanent(str(error)) from error
    manifest = json.loads((movie_dir / "clips" / "manifest.json").read_text(encoding="utf-8"))
    starts = {clip["part"]: clip["start_seconds"] for clip in manifest["clips"]}
    if not outputs:
        raise Permanent("SOURCE_SHORTER_THAN_30_SECONDS")
    done = set(job.get("existingParts") or [])
    pending = [entry for entry in outputs if entry["part"] not in done]
    for offset in range(0, len(pending), REPORT_BATCH):
        if beat.lost:
            raise LeaseLost()
        batch = pending[offset:offset + REPORT_BATCH]
        reports = []
        files = []
        for entry in batch:
            base = Path(entry["path"])
            captions_file = base.with_suffix(".captions.json")
            cues = fit_server_limits(json.loads(captions_file.read_text(encoding="utf-8"))["cues"]) if captions_file.exists() else []
            try:
                captioned = Path(burn(base, cues, entry["part"], movie_dir / "captioned", font)["path"])
            except ValueError as error:
                raise Permanent(str(error)) from error
            files.append((entry["part"], "base", base))
            files.append((entry["part"], 1, captioned))
            reports.append({"part": entry["part"], "startMs": round(starts[entry["part"]] * 1000), "captions": cues})
        urls = api.call("upload_urls", **lease_args(job), items=[{"part": part, "variant": variant} for part, variant, _ in files])["urls"]
        for (part, variant, path), signed in zip(files, urls):
            if signed["part"] != part or signed["variant"] != variant:
                raise RuntimeError("Signed URL order mismatch")
            upload(signed["url"], path, opener)
        api.call("report_clips", **lease_args(job), clips=reports)
        beat.progress = min(95, 10 + int(85 * (offset + len(batch)) / len(pending)))
    api.call("complete", **lease_args(job))

def cleanup(path: Path):
    # Finished or permanently failed: the source and renders are no longer needed on this disk.
    shutil.rmtree(path, ignore_errors=True)

def rerender(api: Api, job: dict, work: Path, font: Path, opener=urllib.request.urlopen):
    clip = job["clip"]
    clip_dir = work / job["movieId"] / "rerender" / clip["id"]
    clip_dir.mkdir(parents=True, exist_ok=True)
    base = download(clip["baseUrl"], clip_dir / "base.mp4", opener)
    try:
        output = Path(burn(base, clip["captions"], clip["part"], clip_dir / f"r{clip['revision']}", font)["path"])
    except ValueError as error:
        raise Permanent(str(error)) from error
    [signed] = api.call("upload_urls", **lease_args(job), items=[{"part": clip["part"], "variant": clip["revision"]}])["urls"]
    upload(signed["url"], output, opener)
    api.call("complete", **lease_args(job), revision=clip["revision"])
    cleanup(clip_dir)

def run_once(api: Api, work: Path, font: Path, model_dir: Path | None, opener=urllib.request.urlopen) -> bool:
    job = api.call("lease").get("job")
    if not job:
        return False
    with Heartbeat(api, job) as beat:
        try:
            if job["kind"] == "rerender":
                rerender(api, job, work, font, opener)
            else:
                process(api, job, work, font, model_dir, beat, opener)
                cleanup(work / job["movieId"])
        except (LeaseLost, RenderBusy) as error:
            # Busy means another live worker holds this movie; leave the job to its lease instead of burning an attempt.
            print(json.dumps({"job": job["id"], "status": "lease_lost" if isinstance(error, LeaseLost) else "render_busy"}))
        except Permanent as error:
            api.call("fail", **lease_args(job), error=str(error)[:500], retryable=False)
            if job["kind"] != "rerender":
                cleanup(work / job["movieId"])
        except Exception as error:
            # Leased outputs are deterministic and resumable, so a retry repeats no completed upload work twice.
            api.call("fail", **lease_args(job), error=f"{type(error).__name__}: {error}"[:500], retryable=True)
    return True

def main():
    api = Api(os.environ["MOVIE_API_URL"], os.environ["MOVIE_WORKER_SECRET"])
    work = Path(os.environ.get("MOVIE_WORK_DIR", "/work"))
    font = Path(os.environ.get("MOVIE_FONT", "/worker/fonts/Tajawal-Regular.ttf"))
    model = os.environ.get("MOVIE_WHISPER_MODEL_DIR")
    poll = int(os.environ.get("MOVIE_POLL_SECONDS", "30"))
    if not font.is_file():
        raise SystemExit("Arabic font missing: set MOVIE_FONT")
    while True:
        try:
            if not run_once(api, work, font, Path(model) if model else None):
                time.sleep(poll)
        except Exception as error:
            print(json.dumps({"status": "worker_error", "error": str(error)[:300]}))
            time.sleep(poll)

if __name__ == "__main__":
    main()

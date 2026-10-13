import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from cloud_worker import Api, LeaseLost, run_once

FONT = Path(__file__).resolve().parents[2] / "public" / "Tajawal-Regular.ttf"

class FakeStorage:
    """Serves file:// sources and records PUT uploads, standing in for signed URLs."""
    def __init__(self):
        self.objects = {}

    def __call__(self, request, timeout=None):
        url = request.full_url
        if request.get_method() == "PUT":
            data = request.data.read() if hasattr(request.data, "read") else request.data
            self.objects[url] = data
            return _Response(b"", 200)
        if url.startswith("mem://"):
            return _Response(self.objects[url], 200)
        return open(url.removeprefix("file://"), "rb")

class _Response(io.BytesIO):
    def __init__(self, data, status):
        super().__init__(data)
        self.status = status

class FakeApi:
    def __init__(self, jobs):
        self.jobs = list(jobs)
        self.calls = []

    def call(self, action, **payload):
        self.calls.append((action, payload))
        if action == "lease":
            return {"job": self.jobs.pop(0) if self.jobs else None}
        if action == "upload_urls":
            return {"urls": [{**item, "url": f"mem://{item['part']}/{item['variant']}"} for item in payload["items"]]}
        return {"ok": True}

def synthetic(path: Path, seconds: int):
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", f"testsrc=size=640x360:rate=30:duration={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(path)], check=True, timeout=300)

@unittest.skipUnless(FONT.is_file(), "Tajawal font required")
class CloudWorkerTests(unittest.TestCase):
    def test_process_uploads_base_and_captioned_then_rerender_uses_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "licensed.mp4"
            synthetic(source, 65)
            storage = FakeStorage()
            api = FakeApi([{"id": "job-1", "leaseToken": "t", "kind": "process", "movieId": "m1", "sourceUrl": f"file://{source}", "existingParts": []}])
            self.assertTrue(run_once(api, root / "work", FONT, None, storage))
            actions = [name for name, _ in api.calls]
            self.assertEqual(actions, ["lease", "upload_urls", "report_clips", "complete"])
            reported = api.calls[2][1]["clips"]
            self.assertEqual([clip["part"] for clip in reported], [1, 2])
            self.assertTrue(all(clip["startMs"] >= 0 for clip in reported))
            self.assertEqual(sorted(storage.objects), ["mem://1/1", "mem://1/base", "mem://2/1", "mem://2/base"])
            self.assertTrue(all(data[4:8] == b"ftyp" for data in storage.objects.values()))
            api.jobs.append({"id": "job-2", "leaseToken": "t2", "kind": "rerender", "movieId": "m1",
                             "clip": {"id": "c1", "part": 1, "revision": 2, "captions": [{"start": 0, "end": 2, "text": "ترجمة معدلة"}], "baseUrl": "mem://1/base"}})
            self.assertTrue(run_once(api, root / "work", FONT, None, storage))
            self.assertIn("mem://1/2", storage.objects)
            self.assertEqual(api.calls[-1], ("complete", {"jobId": "job-2", "leaseToken": "t2", "revision": 2}))

    def test_resume_skips_parts_already_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "licensed.mp4"
            synthetic(source, 31)
            api = FakeApi([{"id": "job", "leaseToken": "t", "kind": "process", "movieId": "m", "sourceUrl": f"file://{source}", "existingParts": [1]}])
            run_once(api, root / "work", FONT, None, FakeStorage())
            self.assertEqual([name for name, _ in api.calls], ["lease", "complete"])

    def test_short_source_fails_permanently_and_bad_captions_do_not_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "short.mp4"
            synthetic(source, 5)
            api = FakeApi([{"id": "j", "leaseToken": "t", "kind": "process", "movieId": "m", "sourceUrl": f"file://{source}", "existingParts": []}])
            run_once(api, root / "work", FONT, None, FakeStorage())
            self.assertEqual(api.calls[-1][0], "fail")
            self.assertFalse(api.calls[-1][1]["retryable"])

    def test_api_requires_https_and_long_secret(self):
        with self.assertRaises(ValueError):
            Api("http://example.com", "x" * 40)
        with self.assertRaises(ValueError):
            Api("https://example.com", "short")

if __name__ == "__main__":
    unittest.main()

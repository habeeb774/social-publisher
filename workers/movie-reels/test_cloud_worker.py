import io
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
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
@patch.dict('os.environ', {'MOVIE_CLIP_SELECTION': 'sequential'})
class CloudWorkerTests(unittest.TestCase):
    def test_bad_model_response_keeps_work_and_reports_retryable(self):
        from unittest import mock
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.mp4'
            source.write_bytes(b'fixture')
            cache = root / 'work' / 'm' / 'clips'
            cache.mkdir(parents=True)
            (cache / 'completed-rating.json').write_text('{"score":9}')
            api = FakeApi([{'id':'j','leaseToken':'t','kind':'process','movieId':'m','sourceUrl':f'file://{source}','existingParts':[]}])
            with mock.patch('cloud_worker.render', side_effect=RuntimeError('HIGHLIGHT_MODEL_TEMPORARY_FAILURE_RETRYABLE')):
                run_once(api, root / 'work', FONT, None, FakeStorage())
            self.assertEqual(api.calls[-1][0], 'fail')
            self.assertTrue(api.calls[-1][1]['retryable'])
            self.assertTrue((cache / 'completed-rating.json').is_file())
            self.assertTrue((root / 'work' / 'm' / 'source.video').is_file())

    def test_process_uploads_base_and_captioned_then_rerender_uses_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "licensed.mp4"
            synthetic(source, 65)
            storage = FakeStorage()
            api = FakeApi([{"id": "job-1", "leaseToken": "t", "kind": "process", "movieId": "m1", "sourceUrl": f"file://{source}", "existingParts": []}])
            self.assertTrue(run_once(api, root / "work", FONT, None, storage))
            self.assertFalse((root / "work" / "m1").exists(), "work dir removed after complete")
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
            Api("http://example.com", "x" * 40, allow_insecure=False)
        with self.assertRaises(ValueError):
            Api("https://example.com", "short")

    def test_insecure_http_requires_explicit_opt_in(self):
        import os
        from unittest import mock
        with mock.patch.dict(os.environ, {"MOVIE_ALLOW_INSECURE_API": ""}):
            with self.assertRaises(ValueError):
                Api("http://host.docker.internal:3000", "x" * 40)
        with mock.patch.dict(os.environ, {"MOVIE_ALLOW_INSECURE_API": "1"}):
            self.assertTrue(Api("http://host.docker.internal:3000", "x" * 40).url.endswith("/api/movies/worker"))
        with self.assertRaises(ValueError):
            Api("ftp://x", "x" * 40, allow_insecure=True)

class ClassificationTests(unittest.TestCase):
    def test_client_errors_are_permanent_except_lease_lost_timeout_and_throttle(self):
        import urllib.error
        from cloud_worker import Permanent
        def opener_for(code, detail):
            def opener(request, timeout=None):
                raise urllib.error.HTTPError(request.full_url, code, "x", {}, io.BytesIO(json.dumps({"error": detail}).encode()))
            return opener
        api = lambda code, detail: Api("https://example.com", "x" * 40, opener=opener_for(code, detail))
        with self.assertRaises(LeaseLost):
            api(409, "LEASE_LOST").call("heartbeat")
        for code, detail in [(400, "INVALID_REQUEST"), (403, "UPLOAD_TARGET_NOT_ALLOWED"), (409, "CLIP_OUTPUT_MISSING")]:
            with self.assertRaises(Permanent):
                api(code, detail).call("report_clips")
        for code in (408, 429, 503):
            with self.assertRaises(RuntimeError):
                api(code, "X").call("report_clips")

    def test_render_value_error_is_permanent_and_busy_is_not_a_failed_attempt(self):
        from unittest import mock
        from render import RenderBusy
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "s.mp4"
            source.write_bytes(b"x")
            job = lambda: {"id": "j", "leaseToken": "t", "kind": "process", "movieId": "m", "sourceUrl": f"file://{source}", "existingParts": []}
            api = FakeApi([job()])
            with mock.patch("cloud_worker.render", side_effect=ValueError("Output directory belongs to another source")):
                run_once(api, root / "work", FONT, None, FakeStorage())
            self.assertEqual(api.calls[-1][0], "fail")
            self.assertFalse(api.calls[-1][1]["retryable"])
            self.assertFalse((root / "work" / "m").exists(), "work dir removed after permanent failure")
            api = FakeApi([job()])
            with mock.patch("cloud_worker.render", side_effect=RenderBusy("m")):
                run_once(api, root / "work", FONT, None, FakeStorage())
            self.assertEqual([name for name, _ in api.calls], ["lease"])

    def test_lost_lease_stops_render_via_check(self):
        from unittest import mock
        from cloud_worker import Heartbeat
        beat = Heartbeat(FakeApi([]), {"id": "j", "leaseToken": "t"})
        beat.lost = True
        with self.assertRaises(LeaseLost):
            beat.check()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "s.mp4"
            source.write_bytes(b"x")
            api = FakeApi([{"id": "j", "leaseToken": "t", "kind": "process", "movieId": "m", "sourceUrl": f"file://{source}", "existingParts": []}])
            def fake_render(*_args, check=None, **_kwargs):
                check()
            with mock.patch("cloud_worker.render", side_effect=fake_render), mock.patch.object(Heartbeat, "check", side_effect=LeaseLost()):
                run_once(api, root / "work", FONT, None, FakeStorage())
            self.assertEqual([name for name, _ in api.calls], ["lease"])

if __name__ == "__main__":
    unittest.main()

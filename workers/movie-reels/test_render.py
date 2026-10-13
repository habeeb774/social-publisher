import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from render import RenderBusy, directory_lock, render, prepare_captions

class ResumeTests(unittest.TestCase):
    def test_human_caption_edits_survive_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            srt = Path(directory) / "part-001.srt"
            editable = srt.with_suffix(".captions.json")
            text = json.dumps({"source_sha256":"same","start_seconds":0,"cues":[{"start":1,"end":3,"text":"تعديل المراجع"}]}, ensure_ascii=False)
            editable.write_text(text,encoding="utf-8")
            self.assertTrue(prepare_captions(srt,[{"start":0,"end":2,"text":"النص القديم"}],{"start_seconds":0},"same"))
            self.assertEqual(editable.read_text(encoding="utf-8"),text)
            self.assertIn("تعديل المراجع",srt.read_text(encoding="utf-8"))
            self.assertNotIn("النص القديم",srt.read_text(encoding="utf-8"))

    def test_edited_captions_work_without_original_transcript(self):
        with tempfile.TemporaryDirectory() as directory:
            srt=Path(directory)/"part-001.srt"
            srt.with_suffix(".captions.json").write_text(json.dumps({"cues":[{"start":0,"end":1,"text":"edited"}]}))
            self.assertTrue(prepare_captions(srt,None,{"start_seconds":0},"same"))

    def test_wrong_source_or_timing_rejected_without_replacing_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            srt=Path(directory)/"part-001.srt"
            for metadata in [{"source_sha256":"other"},{"start_seconds":31}]:
                text=json.dumps({**metadata,"cues":[]})
                editable=srt.with_suffix(".captions.json")
                editable.write_text(text)
                with self.assertRaises(ValueError):
                    prepare_captions(srt,[],{"start_seconds":0},"same")
                self.assertEqual(editable.read_text(),text)

    def test_concurrent_render_is_rejected_but_stale_lock_file_is_not(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / ".render.lock").touch()  # left behind by a crashed process
            with self.assertRaises(ValueError):  # gets past the lock to input validation
                render(output / "missing.mp4", output)
            with directory_lock(output):
                with self.assertRaises(RenderBusy):
                    render(output / "missing.mp4", output)

    @patch("render.validate_output", return_value=True)
    @patch("render.source_hash", return_value="same")
    def test_input_side_seek_and_cancellation_check(self, _hash, _validate):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mp4"
            source.touch()
            clips = [{"part":1,"start_seconds":6000,"duration_seconds":30},{"part":2,"start_seconds":6030,"duration_seconds":30}]
            (root / "manifest.json").write_text(json.dumps({"source_sha256":"same","clips":clips}))
            calls = []
            def fake_run(args, **_):
                calls.append(args)
                Path(args[-1]).touch()
            with patch("render.subprocess.run", side_effect=fake_run):
                checks = []
                def check():
                    checks.append(1)
                    if len(checks) > 1:
                        raise RuntimeError("lease lost")
                with self.assertRaises(RuntimeError):
                    render(source, root, limit=2, check=check)
            self.assertEqual(len(calls), 1, "stopped before the second clip")
            args = calls[0]
            self.assertLess(args.index("-ss"), args.index("-i"))
            self.assertEqual(args[args.index("-ss") + 1], "6000")

    @patch("render.validate_output", return_value=True)
    @patch("render.source_hash", return_value="same")
    def test_completed_clip_is_not_rendered_again(self, _hash, _validate):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mp4"
            source.touch()
            (root / "part-001.mp4").touch()
            (root / "manifest.json").write_text(json.dumps({"source_sha256":"same","clips":[{"part":1,"start_seconds":0,"duration_seconds":30}]}))
            with patch("render.subprocess.run") as run:
                self.assertEqual(len(render(source, root)), 1)
                run.assert_not_called()
            with directory_lock(root):  # lock released after render
                pass

    @patch("render.source_hash", return_value="different")
    def test_wrong_source_does_not_reuse_output(self, _hash):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mp4"
            source.touch()
            (root / "manifest.json").write_text(json.dumps({"source_sha256":"old","clips":[]}))
            with self.assertRaises(ValueError):
                render(source, root)
            with directory_lock(root):  # lock released after render
                pass

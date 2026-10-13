import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from render import render, prepare_captions

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

    def test_concurrent_render_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / ".render.lock").touch()
            with self.assertRaises(FileExistsError):
                render(output / "source.mp4", output)

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
            self.assertFalse((root / ".render.lock").exists())

    @patch("render.source_hash", return_value="different")
    def test_wrong_source_does_not_reuse_output(self, _hash):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mp4"
            source.touch()
            (root / "manifest.json").write_text(json.dumps({"source_sha256":"old","clips":[]}))
            with self.assertRaises(ValueError):
                render(source, root)
            self.assertFalse((root / ".render.lock").exists())

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from render import render

class ResumeTests(unittest.TestCase):
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

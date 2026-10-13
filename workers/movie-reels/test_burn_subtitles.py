import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from burn_subtitles import burn

class BurnTests(unittest.TestCase):
    @patch("burn_subtitles.validate_output", return_value=True)
    @patch("burn_subtitles.source_hash", return_value="sha")
    def test_cache_reuse_and_review_reset(self, _hash, _validate):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            font = root / "font.ttf"
            font.touch()
            def produce(command, **_kwargs):
                Path(command[-1]).touch()
            with patch("burn_subtitles.subprocess.run", side_effect=produce) as run:
                first = burn(root / "source.mp4", [], 1, root, font)
                second = burn(root / "source.mp4", [], 1, root, font)
                self.assertEqual(first, second)
                self.assertEqual(run.call_count, 1)
                self.assertEqual(first["status"], "review_required")
                changed = burn(root / "source.mp4", [{"start":0,"end":2,"text":"تعديل"}], 1, root, font)
                self.assertNotEqual(first["revision"], changed["revision"])

    def test_invalid_part_rejected(self):
        for part in [0,-1,True]:
            with self.assertRaises(ValueError):
                burn(Path("x"), [], part, Path("out"), Path("font"))

"""Tests for safe 30-second movie preview planning."""
import unittest
from unittest.mock import patch
from pathlib import Path
from plan_clips import plan

class PlanClipsTests(unittest.TestCase):
    @patch("plan_clips.duration_seconds", return_value=65)
    def test_only_complete_clips(self, _probe):
        clips = plan(Path("example.mp4"))
        self.assertEqual(len(clips), 2)
        self.assertEqual([x["start_seconds"] for x in clips], [0, 30])
        self.assertTrue(all(x["duration_seconds"] == 30 for x in clips))

    @patch("plan_clips.duration_seconds", return_value=20)
    def test_short_video(self, _probe):
        self.assertEqual(plan(Path("short.mp4")), [])

    @patch("plan_clips.duration_seconds", return_value=float("nan"))
    def test_invalid_duration(self, _probe):
        self.assertEqual(plan(Path("invalid.mp4")), [])

if __name__ == "__main__":
    unittest.main()

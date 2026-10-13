import unittest
import json
import tempfile
import io
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from highlights import select_highlights, validate_rating, highlight_plan


class HighlightTests(unittest.TestCase):
    def test_best_scenes_across_film_no_overlap_chronological(self):
        clips = select_highlights([
            {'start_seconds': 0, 'score': 2},
            {'start_seconds': 600, 'score': 8},
            {'start_seconds': 610, 'score': 9},
            {'start_seconds': 3600, 'score': 10}], 2)
        self.assertEqual([c['start_seconds'] for c in clips], [610, 3600])
        self.assertEqual([c['part'] for c in clips], [1, 2])

    def test_quiet_scenes_not_used_to_fill_limit(self):
        self.assertEqual(select_highlights([{'start_seconds': 0, 'score': 2}], 5), [])

    def test_invalid_model_ratings_rejected(self):
        for score in (True, float('nan'), 11, -1, '9'):
            with self.assertRaises(ValueError):
                validate_rating({'score': score, 'reason': 'danger'})

    @patch.dict('os.environ', {'MOVIE_HIGHLIGHT_MODEL': ''})
    def test_missing_model_never_silently_uses_sequential(self):
        with self.assertRaisesRegex(ValueError, 'MODEL_REQUIRED'):
            highlight_plan(Path('film.mp4'), Path('.'))

    @patch.dict('os.environ', {'MOVIE_HIGHLIGHT_MODEL': 'test-vision', 'MOVIE_HIGHLIGHT_URL': 'http://localhost:11434', 'MOVIE_HIGHLIGHT_MAX_CLIPS': '20', 'MOVIE_HIGHLIGHT_MIN_SCORE': '6'})
    @patch('highlights.duration_seconds', return_value=65)
    @patch('highlights.subprocess.run', return_value=SimpleNamespace(stdout=b'jpeg'))
    def test_full_scan_including_tail_and_cached_resume(self, ffmpeg, probe):
        calls = []
        class Response(io.BytesIO):
            def geturl(self):
                return 'http://localhost:11434/api/chat'
        def open_request(request, timeout):
            body = json.loads(request.data)
            self.assertEqual(len(body['messages'][1]['images']), 5)
            calls.append(body)
            return Response(json.dumps({'message': {'content': json.dumps({'score': 9, 'reason': 'مواجهة'})}}).encode())
        with tempfile.TemporaryDirectory() as directory:
            with patch('highlights.urllib.request.build_opener', return_value=SimpleNamespace(open=open_request)):
                clips = highlight_plan(Path('film.mp4'), Path(directory))
                self.assertEqual(len(calls), 4)  # 0, 15, 30, 35 seconds
                self.assertEqual([c['start_seconds'] for c in clips], [0, 30])
                self.assertEqual(highlight_plan(Path('film.mp4'), Path(directory)), clips)
                self.assertEqual(len(calls), 4)
                self.assertEqual(ffmpeg.call_count, 20)

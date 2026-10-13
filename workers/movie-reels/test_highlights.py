import unittest
import json
import tempfile
import io
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from highlights import select_highlights, validate_rating, highlight_plan, request_rating


class HighlightTests(unittest.TestCase):
    @patch('highlights.time.sleep')
    def test_empty_and_malformed_content_retry_with_json_fallback(self, sleep):
        payloads = []
        replies = iter([b'{"message":{"content":""}}', b'{"message":{"content":"not json"}}', json.dumps({'message': {'content': json.dumps({'score': 9, 'reason': 'danger', 'kind': 'danger'})}}).encode()])
        class Response(io.BytesIO):
            def geturl(self):
                return 'http://localhost:11434/api/chat'
        def open_request(request, timeout):
            payloads.append(json.loads(request.data))
            return Response(next(replies))
        with patch('highlights.urllib.request.build_opener', return_value=SimpleNamespace(open=open_request)):
            self.assertEqual(request_rating('http://localhost:11434', {'format': {'type': 'object'}})['score'], 9)
        self.assertEqual([p['format'] for p in payloads[1:]], ['json', 'json'])
        self.assertEqual(sleep.call_count, 2)

    @patch('highlights.time.sleep')
    def test_persistent_bad_output_is_retryable_not_permanent(self, sleep):
        class Response(io.BytesIO):
            def geturl(self):
                return 'http://localhost:11434/api/chat'
        opener = SimpleNamespace(open=lambda *args, **kwargs: Response(b''))
        with patch('highlights.urllib.request.build_opener', return_value=opener):
            with self.assertRaisesRegex(RuntimeError, 'TEMPORARY_FAILURE_RETRYABLE'):
                request_rating('http://localhost:11434', {})
        self.assertEqual(sleep.call_count, 2)

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
        for value in (None, [], 'score=9'):
            with self.assertRaises(ValueError):
                validate_rating(value)
        for score in (True, float('nan'), 11, -1, '9'):
            with self.assertRaises(ValueError):
                validate_rating({'score': score, 'reason': 'danger'})

    def test_quiet_and_graphics_never_selected_for_their_motion(self):
        for kind in ('quiet', 'credits', 'test_pattern', 'uncertain'):
            self.assertEqual(validate_rating({'score': 9, 'reason': 'colors', 'kind': kind})['score'], 0)

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
            self.assertGreaterEqual(body['options']['num_ctx'], 8192)
            calls.append(body)
            return Response(json.dumps({'message': {'content': json.dumps({'score': 9, 'reason': 'مواجهة', 'kind': 'confrontation'})}}).encode())
        with tempfile.TemporaryDirectory() as directory:
            with patch('highlights.urllib.request.build_opener', return_value=SimpleNamespace(open=open_request)):
                clips = highlight_plan(Path('film.mp4'), Path(directory))
                self.assertEqual(len(calls), 4)  # 0, 15, 30, 35 seconds
                self.assertEqual([c['start_seconds'] for c in clips], [0, 30])
                self.assertEqual(highlight_plan(Path('film.mp4'), Path(directory)), clips)
                self.assertEqual(len(calls), 4)
                self.assertEqual(ffmpeg.call_count, 20)

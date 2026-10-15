import unittest
import json
import tempfile
import io
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from highlights import (select_highlights, validate_rating, highlight_plan, request_rating,
                        validate_story, align_interval, review_story, editing_context)


class HighlightTests(unittest.TestCase):
    def story(self, **changes):
        return dict(score=9, reason='مواجهة متصاعدة', kind='confrontation', hook=8,
                    escalation=9, ending=8, coherence=9,
                    evidence='0.5 مواجهة، 15 تصاعد، 29.5 نتيجة واضحة', **changes)

    def test_motion_cannot_compensate_for_missing_story(self):
        for key in ('hook', 'escalation', 'ending', 'coherence'):
            story = self.story()
            story[key] = 4
            self.assertEqual(validate_story(story)['score'], 0)
        story = self.story()
        story['kind'] = 'test_pattern'
        self.assertEqual(validate_story(story)['score'], 0)

    def test_story_metrics_and_evidence_fail_closed(self):
        for bad in (True, float('nan'), '9', 11, -1, None):
            story = self.story()
            story['coherence'] = bad
            with self.assertRaises(ValueError):
                validate_story(story)
        story = self.story()
        del story['evidence']
        with self.assertRaises(ValueError):
            validate_story(story)

    def test_boundaries_avoid_cutting_dialogue_at_both_ends(self):
        cues = [{'start': 9, 'end': 11, 'text': 'سؤال'}, {'start': 38, 'end': 41, 'text': 'جواب'}]
        start = align_interval(10, 100, cues, [11.1], [])
        self.assertEqual(start, 11.1)
        self.assertGreaterEqual(start, 11)
        self.assertGreaterEqual(start + 30, 41)

    def test_no_safe_interval_is_not_forced_to_fill_quota(self):
        cues = [{'start': 0, 'end': 90, 'text': 'long speech'}]
        self.assertIsNone(align_interval(15, 90, cues, [], []))

    def test_clean_boundaries_and_tail_are_in_range(self):
        self.assertEqual(align_interval(10, 65, [], [11, 41], []), 11)
        self.assertEqual(align_interval(35, 65, [], [38, 68], []), 35)

    @patch('highlights.subprocess.run', return_value=SimpleNamespace(stdout=b'jpeg'))
    def test_second_pass_uses_ten_frames_dialogue_and_caches_by_text(self, ffmpeg):
        with tempfile.TemporaryDirectory() as directory:
            cues = [{'start': 1, 'end': 3, 'text': 'هل نهرب؟'}]
            with patch('highlights.request_rating', return_value=validate_story(self.story())) as request:
                result = review_story(Path('film'), 0, cues, 'test', 'http://localhost', Path(directory))
                body = request.call_args.args[1]
                self.assertEqual(len(body['messages'][1]['images']), 10)
                self.assertIn('هل نهرب', body['messages'][1]['content'])
                self.assertEqual(request.call_args.kwargs['validator'], validate_story)
                self.assertEqual(review_story(Path('film'), 0, cues, 'test', 'http://localhost', Path(directory)), result)
                self.assertEqual(request.call_count, 1)
                cues[0]['text'] = 'تعديل المراجع'
                review_story(Path('film'), 0, cues, 'test', 'http://localhost', Path(directory))
                self.assertEqual(request.call_count, 2)

    def test_transcript_for_another_source_rejected_before_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'highlight-source.json').write_text(json.dumps({'source_sha256': 'correct'}))
            (root / 'transcript.json').write_text(json.dumps({'source_sha256': 'wrong', 'cues': []}))
            with self.assertRaisesRegex(ValueError, 'another source'):
                editing_context(Path('film'), root, 60)

    @patch('highlights.scene_boundaries', return_value=[10, 40])
    def test_silent_video_without_audio_stream_is_supported_and_cached(self, boundaries):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch('highlights.subprocess.run', return_value=SimpleNamespace(stdout='{"streams":[]}')) as run:
                self.assertEqual(editing_context(Path('film'), root, 60), ([], [10, 40], []))
                self.assertEqual(editing_context(Path('film'), root, 60), ([], [10, 40], []))
                self.assertEqual(run.call_count, 1)
                self.assertEqual(boundaries.call_count, 1)

    @patch('highlights.scene_boundaries', return_value=[])
    def test_audio_silences_include_trailing_silence_not_sound_semantics(self, boundaries):
        with tempfile.TemporaryDirectory() as directory:
            replies = [SimpleNamespace(stdout='{"streams":[{"index":1}]}'),
                       SimpleNamespace(stderr='silence_start: 2.5\nsilence_end: 3.5\nsilence_start: 58')]
            with patch('highlights.subprocess.run', side_effect=replies):
                self.assertEqual(editing_context(Path('film'), Path(directory), 60)[2], [[2.5, 3.5], [58, 60]])

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
        self.assertEqual(select_highlights([{'start_seconds': 0, 'score': 0}], 5, threshold=0), [])

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
    @patch('highlights.editing_context', return_value=([], [], []))
    def test_full_scan_including_tail_and_cached_resume(self, context, ffmpeg, probe):
        calls = []
        class Response(io.BytesIO):
            def geturl(self):
                return 'http://localhost:11434/api/chat'
        def open_request(request, timeout):
            body = json.loads(request.data)
            count = len(body['messages'][1]['images'])
            self.assertIn(count, (5, 10))
            self.assertGreaterEqual(body['options']['num_ctx'], 8192)
            calls.append(body)
            rating = self.story() if count == 10 else {'score': 9, 'reason': 'مواجهة', 'kind': 'confrontation'}
            return Response(json.dumps({'message': {'content': json.dumps(rating)}}).encode())
        with tempfile.TemporaryDirectory() as directory:
            with patch('highlights.urllib.request.build_opener', return_value=SimpleNamespace(open=open_request)):
                clips = highlight_plan(Path('film.mp4'), Path(directory))
                self.assertEqual(len(calls), 6)  # four coarse windows, two story reviews
                self.assertEqual([c['start_seconds'] for c in clips], [0, 30])
                self.assertEqual(highlight_plan(Path('film.mp4'), Path(directory)), clips)
                self.assertEqual(len(calls), 6)
                self.assertEqual(ffmpeg.call_count, 40)

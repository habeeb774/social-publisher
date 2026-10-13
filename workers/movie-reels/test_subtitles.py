import unittest
from subtitles import clip_cues, to_srt, validate_cues

class SubtitleTests(unittest.TestCase):
    def test_boundaries_shift_and_clamp_to_clip(self):
        cues = [{"start":28,"end":32,"text":"أهلًا"},{"start":58,"end":62,"text":"النهاية"}]
        result = clip_cues(cues, 30)
        self.assertEqual(result, [{"start":0,"end":2,"text":"أهلًا"},{"start":28,"end":30,"text":"النهاية"}])

    def test_srt_arabic_and_millisecond_precision(self):
        self.assertIn("00:00:01,250 --> 00:00:02,500\nالجزء الأول", to_srt([{"start":1.25,"end":2.5,"text":"الجزء الأول"}]))

    def test_invalid_edits_rejected(self):
        for cue in [{"start":-1,"end":2,"text":"x"},{"start":0,"end":31,"text":"x"},{"start":0,"end":1,"text":""},{"start":float("nan"),"end":1,"text":"x"}]:
            with self.assertRaises(ValueError):
                validate_cues([cue],30)
        with self.assertRaises(ValueError):
            validate_cues([{"start":0,"end":2,"text":"x"},{"start":1,"end":3,"text":"y"}],30)

    def test_blank_text_cannot_inject_srt_blocks(self):
        text = to_srt([{"start":0,"end":2,"text":"one\n\n99\n-->"}])
        self.assertEqual(text.count("-->"), 1)
        self.assertEqual(to_srt([]), "")


class ServerLimitTests(unittest.TestCase):
    def test_long_cues_split_and_count_capped(self):
        from subtitles import fit_server_limits
        long = " ".join(["كلمة"] * 200)
        fitted = fit_server_limits([{"start": 0, "end": 10, "text": long}, {"start": 10, "end": 12, "text": "x" * 700}])
        self.assertTrue(all(0 < len(cue["text"]) <= 300 for cue in fitted))
        self.assertTrue(all(cue["end"] > cue["start"] for cue in fitted))
        self.assertTrue(all(b["start"] >= a["end"] for a, b in zip(fitted, fitted[1:])))
        self.assertLessEqual(fitted[-1]["end"], 12)
        self.assertEqual(" ".join(c["text"] for c in fitted[:-3]), long)
        many = [{"start": i * .1, "end": i * .1 + .05, "text": "a"} for i in range(250)]
        self.assertEqual(len(fit_server_limits(many)), 200)

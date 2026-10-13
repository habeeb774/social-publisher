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

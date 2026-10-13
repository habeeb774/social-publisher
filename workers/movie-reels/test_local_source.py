import io
import os
import tempfile
import unittest
from pathlib import Path
from cloud_worker import SAMPLE, local_source

class RangeStore:
    """Signed-URL stand-in honoring Range requests over the stored object's bytes."""
    def __init__(self, data: bytes):
        self.data, self.calls = data, 0

    def __call__(self, request, timeout=None):
        self.calls += 1
        start, end = map(int, request.get_header("Range").removeprefix("bytes=").split("-"))
        return io.BytesIO(self.data[start:end + 1])

class LocalSourceTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.folder = Path(self.dir.name)
        self.data = os.urandom(3 * SAMPLE + 123)
        (self.folder / "film.mp4").write_bytes(self.data)
        self.job = {"sourceUrl": "https://storage.invalid/x", "sourceName": "film.mp4", "sourceSize": len(self.data)}

    def tearDown(self):
        self.dir.cleanup()

    def test_matching_local_original_is_reused_after_sampled_comparison(self):
        store = RangeStore(self.data)
        self.assertEqual(local_source(self.job, [self.folder], store), self.folder / "film.mp4")
        self.assertEqual(store.calls, 3)

    def test_changed_bytes_size_or_name_fall_back_to_download(self):
        changed = bytearray(self.data); changed[len(changed) // 2] ^= 1
        self.assertIsNone(local_source(self.job, [self.folder], RangeStore(bytes(changed))))
        self.assertIsNone(local_source({**self.job, "sourceSize": len(self.data) + 1}, [self.folder], RangeStore(self.data)))
        self.assertIsNone(local_source({**self.job, "sourceName": "other.mp4"}, [self.folder], RangeStore(self.data)))

    def test_path_components_in_name_are_refused(self):
        for name in ["../film.mp4", "sub/film.mp4", None]:
            self.assertIsNone(local_source({**self.job, "sourceName": name}, [self.folder], RangeStore(self.data)))

    def test_no_configured_folders_means_download(self):
        self.assertIsNone(local_source(self.job, [], RangeStore(self.data)))

if __name__ == "__main__":
    unittest.main()

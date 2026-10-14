import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from catalog_import import official_download,unpack_movie,parse_srt,SOURCES

class Response(io.BytesIO):
    def __init__(self,data,expected=None):
        super().__init__(data)
        self.status=200
        self.headers={"Content-Length":str(len(data) if expected is None else expected)}

class CatalogTests(unittest.TestCase):
    def test_only_exact_official_urls(self):
        with tempfile.TemporaryDirectory() as d:
            for url in ["http://127.0.0.1/movie.mp4","https://download.blender.org.evil.test/file","https://download.blender.org/other.mp4"]:
                with self.assertRaises(ValueError):
                    official_download(url,Path(d)/"out",opener=lambda *_args,**_kwargs: self.fail("must not request"))

    def test_size_and_truncation_limits(self):
        with tempfile.TemporaryDirectory() as d:
            url=SOURCES["big-buck-bunny"]
            target=Path(d)/"out"
            official_download(url,target,opener=lambda *_args,**_kwargs:Response(b"movie"))
            self.assertEqual(target.read_bytes(),b"movie")
            with self.assertRaises(ValueError):
                official_download(url,target,max_bytes=3,opener=lambda *_args,**_kwargs:Response(b"movie"))
            with self.assertRaises(ValueError):
                official_download(url,target,opener=lambda *_args,**_kwargs:Response(b"movie",8))

    def test_zip_supplied_path_never_selects_destination(self):
        with tempfile.TemporaryDirectory() as d:
            archive=Path(d)/"movie.zip"
            with zipfile.ZipFile(archive,"w") as z:
                z.writestr("../../escape.mov",b"x"*1500)
            out=Path(d)/"safe.mov"
            unpack_movie(archive,out)
            self.assertEqual(out.stat().st_size,1500)
            self.assertFalse((Path(d)/"escape.mov").exists())

    def test_parse_official_subtitles(self):
        cues=parse_srt('1\n00:00:01,000 --> 00:00:02,100\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld')
        self.assertEqual(cues[0],{"start":1,"end":2.1,"text":"Hello"})
        with self.assertRaises(ValueError):parse_srt("garbage")

if __name__=="__main__":unittest.main()

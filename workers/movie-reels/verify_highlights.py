"""Offline-to-private-model smoke test; never leases jobs, uploads or publishes."""
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from render import render


def main():
    # A synthetic clip tests wiring only, not cinematic quality. Accept any valid rating.
    os.environ['MOVIE_HIGHLIGHT_MIN_SCORE'] = '0'
    os.environ['MOVIE_HIGHLIGHT_MAX_CLIPS'] = '1'
    os.environ['MOVIE_CLIP_SELECTION'] = 'highlights'
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='highlight-smoke-') as directory:
        root = Path(directory)
        source = root / 'synthetic.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=320x180:rate=10:duration=30', '-c:v', 'libx264',
                        '-preset', 'ultrafast', str(source)], check=True, timeout=60)
        output = root / 'clips'
        clips = render(source, output, limit=1)
        manifest = json.loads((output / 'manifest.json').read_text())
        assert len(clips) == 1 and manifest['selection'] == 'highlights'
        assert manifest['clips'][0]['duration_seconds'] == 30
        assert manifest['clips'][0]['score'] < 6, 'Synthetic graphics must not qualify as exciting movie scenes'
        resumed = render(source, output, limit=1)
        assert resumed == clips
        print(json.dumps({'status': 'passed', 'model': os.environ['MOVIE_HIGHLIGHT_MODEL'],
                          'elapsed_seconds': round(time.monotonic() - started, 1),
                          'rating': manifest['clips'][0]['score'],
                          'kind': manifest['clips'][0]['kind'],
                          'reason': manifest['clips'][0]['reason'],
                          'publishing': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()

"""Offline-to-private-model smoke test; never leases jobs, uploads or publishes."""
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from render import render
from highlights import review_story


def main():
    # Moving test charts must NEVER become publishable clips, even at threshold zero.
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
        try:
            render(source, output, limit=1)
        except ValueError as error:
            if str(error) != 'NO_CONFIDENT_HIGHLIGHTS_REVIEW_SOURCE':
                raise
        else:
            raise AssertionError('Synthetic graphics must never become rendered highlights')
        assert not (output / 'manifest.json').exists()
        assert not list(output.glob('part-*.mp4'))
        # Exercise the actual richer schema/model too, not only coarse retrieval.
        story = review_story(source, 0, [], os.environ['MOVIE_HIGHLIGHT_MODEL'],
                             os.environ['MOVIE_HIGHLIGHT_URL'], output)
        assert story['score'] == 0, 'Motion without a coherent event must fail temporal review'
        print(json.dumps({'status': 'passed', 'model': os.environ['MOVIE_HIGHLIGHT_MODEL'],
                          'elapsed_seconds': round(time.monotonic() - started, 1),
                          'synthetic_graphics': 'rejected_without_rendering',
                          'publishing': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()

"""Read-only analyzer readiness check before allowing the worker to lease jobs."""
import json
import os
import urllib.request
from highlights import NoRedirect

if os.environ.get('MOVIE_CLIP_SELECTION', 'highlights') == 'highlights':
    model = os.environ.get('MOVIE_HIGHLIGHT_MODEL', '').strip()
    if not model:
        raise SystemExit('MOVIE_HIGHLIGHT_MODEL_REQUIRED')
    endpoint = os.environ.get('MOVIE_HIGHLIGHT_URL', 'http://localhost:11434').rstrip('/')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(endpoint + '/api/show', data=json.dumps({'model': model}).encode(), headers={'Content-Type': 'application/json'})
    with opener.open(request, timeout=30) as response:
        result = json.loads(response.read(1024 * 1024))
    if 'vision' not in result.get('capabilities', []):
        raise SystemExit('MOVIE_HIGHLIGHT_VISION_MODEL_REQUIRED')
    print(json.dumps({'status': 'ready', 'model': model, 'vision': True}))
else:
    print(json.dumps({'status': 'ready', 'selection': 'sequential'}))

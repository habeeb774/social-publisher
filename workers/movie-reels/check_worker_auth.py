"""Read-only authentication probe: intentionally invalid action cannot lease jobs."""
import json
import os
import urllib.error
import urllib.request

request = urllib.request.Request(os.environ['MOVIE_API_URL'].rstrip('/') + '/api/movies/worker',
    data=json.dumps({'action': 'readiness_probe'}).encode(),
    headers={'Authorization': 'Bearer ' + os.environ['MOVIE_WORKER_SECRET'], 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        print(json.dumps({'status': response.status, 'unexpected_acceptance': True}))
except urllib.error.HTTPError as error:
    print(json.dumps({'status': error.code, 'detail': error.read(500).decode(),
                     'authenticated': error.code == 400}))

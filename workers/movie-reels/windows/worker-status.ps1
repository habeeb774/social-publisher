# Shows whether the worker is running and its recent log lines.
docker ps --filter name=movie-reels-worker --format "{{.Names}}  {{.Status}}"
docker logs --tail 30 movie-reels-worker

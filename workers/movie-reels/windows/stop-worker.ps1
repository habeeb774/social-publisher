# Stops the worker. A job in progress returns to the queue after its lease expires (about 20 minutes) and resumes later.
docker rm -f movie-reels-worker

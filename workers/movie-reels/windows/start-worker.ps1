<#
Runs the movie reels worker on this PC with Docker Desktop. It only makes outbound HTTPS calls to
MOVIE_API_URL and signed storage URLs: no open ports, no publishing or approval rights.
The container restarts automatically with Docker Desktop (enable "Start Docker Desktop when you sign in").

  .\start-worker.ps1 -WorkDir D:\movie-work -SourceDir D:\Movies -ModelDir D:\whisper-small
#>
param(
  [string]$WorkDir = "D:\movie-work",
  [string]$SourceDir = "",      # folder holding the originals you upload; reused instead of re-downloading
  [string]$ModelDir = "",       # pre-downloaded faster-whisper model (see download_model.py); empty = no auto subtitles
  [int]$Cpus = [Math]::Max(2, [Environment]::ProcessorCount - 2),
  [int]$MemoryGB = 8   # Docker Desktop (WSL2) gets about half of system RAM by default
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..\..")
$envFile = Join-Path $here "worker.env"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop is not installed or not on PATH." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running. Start it and retry." }
if (-not (Test-Path $envFile)) { throw "Create $envFile from worker.env.example first." }
$secret = (Get-Content $envFile | Where-Object { $_ -match '^MOVIE_WORKER_SECRET=' }) -replace '^MOVIE_WORKER_SECRET=', ''
if ($secret.Trim().Length -lt 32) { throw "MOVIE_WORKER_SECRET in worker.env must be at least 32 characters." }
New-Item -ItemType Directory -Force $WorkDir | Out-Null
# Docker writes progress to stderr; Windows PowerShell 5.1 would treat that as a terminating error.
$ErrorActionPreference = "Continue"

docker build --quiet -f (Join-Path $repo "workers\movie-reels\Dockerfile") -t social-publisher-reels $repo 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Image build failed." }
$modelNetworkArgs = @()
if (Get-Content $envFile | Where-Object { $_ -match '^MOVIE_HIGHLIGHT_URL=http://vision:11434/?$' }) {
  $modelNetworkArgs = @('--network', 'movie-highlights_default')
}
# Do not replace a working worker until the model is downloaded and supports images.
docker run --rm @modelNetworkArgs --env-file $envFile --entrypoint python social-publisher-reels /worker/verify_model.py
if ($LASTEXITCODE -ne 0) { throw 'Vision model is not ready; existing worker has not been replaced.' }
$oldWorker = docker ps --filter 'name=^/movie-reels-worker$' --format '{{.Names}}'
if ($oldWorker) {
  docker exec movie-reels-worker python -c "import os,sys;sys.exit(1 if os.listdir('/work') else 0)"
  if ($LASTEXITCODE -ne 0) { throw 'Worker has unfinished work; wait for it to finish before restarting.' }
}
docker rm -f movie-reels-worker *> $null

$arguments = @("run", "-d", "--name", "movie-reels-worker", "--restart", "unless-stopped",
  "--cpus", "$Cpus", "--memory", "${MemoryGB}g", "--env-file", $envFile, "-v", "${WorkDir}:/work")
$arguments += $modelNetworkArgs
if ($SourceDir) {
  if (-not (Test-Path $SourceDir)) { throw "SourceDir not found: $SourceDir" }
  $arguments += @("-v", "${SourceDir}:/sources:ro", "-e", "MOVIE_LOCAL_SOURCE_DIRS=/sources")
}
if ($ModelDir) {
  if (-not (Test-Path $ModelDir)) { throw "ModelDir not found: $ModelDir" }
  $arguments += @("-v", "${ModelDir}:/models/whisper:ro", "-e", "MOVIE_WHISPER_MODEL_DIR=/models/whisper")
}
docker @arguments social-publisher-reels
if ($LASTEXITCODE -ne 0) { throw "Container failed to start." }
Write-Host "Worker running. Logs: docker logs -f movie-reels-worker   Stop: .\stop-worker.ps1"

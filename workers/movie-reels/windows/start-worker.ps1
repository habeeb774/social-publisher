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

docker build -f (Join-Path $repo "workers\movie-reels\Dockerfile") -t social-publisher-reels $repo
if ($LASTEXITCODE -ne 0) { throw "Image build failed." }
docker rm -f movie-reels-worker *> $null

$arguments = @("run", "-d", "--name", "movie-reels-worker", "--restart", "unless-stopped",
  "--cpus", "$Cpus", "--memory", "${MemoryGB}g", "--env-file", $envFile, "-v", "${WorkDir}:/work")
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

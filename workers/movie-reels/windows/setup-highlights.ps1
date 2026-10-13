param([string]$Model = 'qwen2.5vl:3b')
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$taskDocker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $taskDocker) { $taskDocker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' }
if (-not (Test-Path -LiteralPath $taskDocker)) { throw 'Docker Desktop is required.' }
$env:PATH = (Split-Path -Parent $taskDocker) + ';' + $env:PATH
# Native Docker progress is stderr, not a terminating PowerShell 5.1 error.
$ErrorActionPreference = 'Continue'
& $taskDocker compose -f (Join-Path $taskRepo 'docker-compose.highlights.yml') up -d --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) { throw 'Vision service failed to start.' }
& $taskDocker compose -f (Join-Path $taskRepo 'docker-compose.highlights.yml') exec -T vision ollama pull $Model
if ($LASTEXITCODE -ne 0) { throw 'Model download failed; worker settings have not changed.' }
Write-Host "Vision service ready with $Model. Set MOVIE_HIGHLIGHT_MODEL=$Model and MOVIE_HIGHLIGHT_URL=http://vision:11434 in worker.env, then restart the worker only after its active jobs finish."

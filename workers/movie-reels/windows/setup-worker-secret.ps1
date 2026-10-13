<#
Creates a fresh per-installation secret for the local movie worker.
Writes it ONLY to the ignored windows/worker.env on this PC. Does not
modify Vercel, publish movies, or send secrets to the network.

Usage:
  .\setup-worker-secret.ps1
  .\setup-worker-secret.ps1 -CopyToClipboard  # paste into Vercel env settings
#>
param([switch]$CopyToClipboard)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $here "worker.env"

if (Test-Path -LiteralPath $envPath) {
    throw "worker.env already exists; refusing to overwrite an existing secret. Verify it and use that SAME secret in Vercel."
}

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
} finally {
    $rng.Dispose()
}
$secret = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
if ($secret.Length -ne 64) { throw "Secret generation failed." }

$lines = @(
    "MOVIE_API_URL=https://sp.leanpix.site",
    "MOVIE_WORKER_SECRET=$secret",
    "MOVIE_POLL_SECONDS=30"
)
[System.IO.File]::WriteAllText(
    $envPath,
    (($lines -join [Environment]::NewLine) + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding $false)
)

if ($CopyToClipboard) {
    if (-not (Get-Command Set-Clipboard -ErrorAction SilentlyContinue)) {
        throw "worker.env was created, but Set-Clipboard is not available. Open the file locally."
    }
    Set-Clipboard -Value $secret
    Write-Host "Copied secret to clipboard. Paste it into Vercel Production environment as MOVIE_WORKER_SECRET; clear clipboard afterwards."
}

Write-Host "Created local worker.env (gitignored). Do not upload or share this file."
Write-Host "Add MOVIE_WORKER_SECRET with the SAME value to the Vercel Production environment and redeploy."
Write-Host "Keep MOVIE_REELS_PUBLISHING_ENABLED=false until an authorized end-to-end test succeeds."

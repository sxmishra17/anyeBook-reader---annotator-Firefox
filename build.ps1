# build.ps1 — eBook Annotator Firefox Extension Build Script (Windows)
#
# Requirements: Node.js 18+, npm 9+
# Usage: .\build.ps1

param(
    [string]$ArtifactsDir = "dist"
)

$ErrorActionPreference = "Stop"

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install from https://nodejs.org/en/download"
    exit 1
}
$nodeVersion = node --version
Write-Host "Node.js: $nodeVersion" -ForegroundColor Cyan

# Check / install web-ext
if (-not (Get-Command web-ext -ErrorAction SilentlyContinue)) {
    Write-Host "web-ext not found. Installing globally..." -ForegroundColor Yellow
    npm install --global web-ext
}
$webextVersion = web-ext --version
Write-Host "web-ext: $webextVersion" -ForegroundColor Cyan

# Lint
Write-Host "`nRunning lint..." -ForegroundColor Cyan
web-ext lint --source-dir .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Lint failed with errors. Fix errors before building."
    exit 1
}

# Build
Write-Host "`nBuilding extension..." -ForegroundColor Cyan
web-ext build `
    --source-dir . `
    --artifacts-dir $ArtifactsDir `
    --overwrite-dest `
    --ignore-files "dist/**" "*.md" "build.*" "*.ps1" "*.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild complete: $ArtifactsDir\ebook_annotator-1.0.0.zip" -ForegroundColor Green
} else {
    Write-Error "Build failed."
    exit 1
}

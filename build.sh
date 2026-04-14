#!/bin/bash
# build.sh — eBook Annotator Firefox Extension Build Script (macOS / Linux)
#
# Requirements: Node.js 18+, npm 9+
# Usage: chmod +x build.sh && ./build.sh

set -e

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org/en/download"
    exit 1
fi
echo "Node.js: $(node --version)"

# Check / install web-ext
if ! command -v web-ext &> /dev/null; then
    echo "web-ext not found. Installing globally..."
    npm install --global web-ext
fi
echo "web-ext: $(web-ext --version)"

# Lint
echo ""
echo "Running lint..."
web-ext lint --source-dir .

# Build
echo ""
echo "Building extension..."
web-ext build \
    --source-dir . \
    --artifacts-dir dist \
    --overwrite-dest \
    --ignore-files "dist/**" "*.md" "build.*" "*.ps1" "*.sh"

echo ""
echo "Build complete: dist/ebook_annotator-1.0.0.zip"

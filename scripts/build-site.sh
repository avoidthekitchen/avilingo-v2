#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Checking manual audio content..."
cd "$REPO_ROOT"
uv run python3 manual_audio.py --check

echo "Building BeakSpeak app..."
cd "$REPO_ROOT/beakspeak"
npm run build:web

echo "Keeping only production manual audio..."
CONTENT_BUILD_DIR="$REPO_ROOT/beakspeak/dist/content"
bash "$REPO_ROOT/scripts/prune-runtime-content.sh" "$CONTENT_BUILD_DIR"

echo "Assembling site..."
rm -rf "$REPO_ROOT/dist"
mkdir -p "$REPO_ROOT/dist/beakspeak"
cp -r "$REPO_ROOT/beakspeak/dist/"* "$REPO_ROOT/dist/beakspeak/"
cp "$REPO_ROOT/beakspeak/dist/index.html" "$REPO_ROOT/dist/index.html"

echo "Done. Output in dist/"
echo "  dist/index.html          <- SPA fallback for the BeakSpeak Worker"
echo "  dist/beakspeak/          <- BeakSpeak app for /beakspeak/"
du -sh "$REPO_ROOT/dist/"

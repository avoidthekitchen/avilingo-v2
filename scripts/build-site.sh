#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Checking manual audio and bundled photos..."
cd "$REPO_ROOT"
uv run python3 manual_audio.py --check
uv run python3 bundle_photos.py --check

echo "Building BeakSpeak app..."
cd "$REPO_ROOT/beakspeak"
npm run build:web

echo "Keeping only production audio and bundled photos..."
CONTENT_BUILD_DIR="$REPO_ROOT/beakspeak/dist/content"
bash "$REPO_ROOT/scripts/prune-runtime-content.sh" "$CONTENT_BUILD_DIR"

echo "Assembling site..."
rm -rf "$REPO_ROOT/dist"
mkdir -p "$REPO_ROOT/dist/beakspeak"
cp -r "$REPO_ROOT/beakspeak/dist/"* "$REPO_ROOT/dist/beakspeak/"
cp "$REPO_ROOT/site/index.html" "$REPO_ROOT/dist/index.html"
cp "$REPO_ROOT/site/404.html" "$REPO_ROOT/dist/404.html"

echo "Done. Output in dist/"
echo "  dist/index.html          <- beakspeak.app landing page"
echo "  dist/404.html            <- not-found page for unknown paths"
echo "  dist/beakspeak/          <- BeakSpeak app for /beakspeak/"
du -sh "$REPO_ROOT/dist/"

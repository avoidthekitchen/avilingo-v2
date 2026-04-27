#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building BeakSpeak app..."
cd "$REPO_ROOT/beakspeak"
npx vite build

echo "Assembling site..."
rm -rf "$REPO_ROOT/dist"
mkdir -p "$REPO_ROOT/dist/beakspeak"
cp -r "$REPO_ROOT/beakspeak/dist/"* "$REPO_ROOT/dist/beakspeak/"
cp "$REPO_ROOT/beakspeak/dist/index.html" "$REPO_ROOT/dist/index.html"

echo "Done. Output in dist/"
echo "  dist/index.html          <- SPA fallback for the BeakSpeak Worker"
echo "  dist/beakspeak/          <- BeakSpeak app for /beakspeak/"
du -sh "$REPO_ROOT/dist/"

#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building BeakSpeak app..."
cd "$REPO_ROOT/beakspeak"
npx vite build

echo "Assembling site..."
rm -rf "$REPO_ROOT/dist"
mkdir -p "$REPO_ROOT/dist/beakspeak"
cp "$REPO_ROOT/site/index.html" "$REPO_ROOT/dist/"
cp -r "$REPO_ROOT/beakspeak/dist/"* "$REPO_ROOT/dist/beakspeak/"

echo "Done. Output in dist/"
echo "  dist/index.html          <- under construction landing"
echo "  dist/beakspeak/          <- BeakSpeak app"
du -sh "$REPO_ROOT/dist/"

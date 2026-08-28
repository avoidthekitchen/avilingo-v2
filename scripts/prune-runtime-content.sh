#!/bin/bash
set -euo pipefail

CONTENT_BUILD_DIR="${1:?usage: prune-runtime-content.sh <content-build-directory>}"

if [[ ! -f "$CONTENT_BUILD_DIR/manifest.json" || ! -d "$CONTENT_BUILD_DIR/audio/manual" ]]; then
  echo "Refusing to prune unexpected content directory: $CONTENT_BUILD_DIR" >&2
  exit 1
fi

find "$CONTENT_BUILD_DIR/audio" -mindepth 1 -maxdepth 1 ! -name manual -exec rm -rf -- {} +
find "$CONTENT_BUILD_DIR" -mindepth 1 -maxdepth 1 -type d -name 'audio-archive-*' -exec rm -rf -- {} +
find "$CONTENT_BUILD_DIR" -mindepth 1 -maxdepth 1 -type d -name photos -exec rm -rf -- {} +
find "$CONTENT_BUILD_DIR" -name '.DS_Store' -delete

AUDIO_COUNT="$(find "$CONTENT_BUILD_DIR/audio/manual" -type f -name '*.ogg' | wc -l | tr -d ' ')"
if [[ "$AUDIO_COUNT" != "30" ]]; then
  echo "Expected 30 production audio clips, found $AUDIO_COUNT." >&2
  exit 1
fi

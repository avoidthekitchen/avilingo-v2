#!/bin/bash
set -Eeuo pipefail

trap 'printf "BeakSpeak Cloud preparation failed at line %s.\n" "$LINENO" >&2' ERR

BEAKSPEAK_REPO_DIR="${CI_PRIMARY_REPOSITORY_PATH:?Xcode Cloud must supply CI_PRIMARY_REPOSITORY_PATH}"
if [[ ! -f "$BEAKSPEAK_REPO_DIR/beakspeak/package-lock.json" ||
      ! -f "$BEAKSPEAK_REPO_DIR/content/audio-metadata.lock.json" ]]; then
  printf 'The checkout does not contain the BeakSpeak dependency and audio locks.\n' >&2
  exit 1
fi

# Cloud resolves local Swift packages immediately after this hook. Install the
# npm plugins and regenerate packaged assets before it inspects the Xcode project.
export HOMEBREW_NO_AUTO_UPDATE=1
brew install node@22 ffmpeg uv
BEAKSPEAK_NODE_PREFIX="$(brew --prefix node@22)"
export PATH="$BEAKSPEAK_NODE_PREFIX/bin:$PATH"

cd "$BEAKSPEAK_REPO_DIR"
npm ci --prefix beakspeak

# Reconstruct only the committed selections and metadata. No new XC IDs or
# metadata refresh are requested, so this build needs no XC_API_KEY.
uv run --locked --python 3.12 python3 manual_audio.py
npm run native:sync --prefix beakspeak

#!/usr/bin/env python3
"""Download and normalize all audio/photo assets for the Birdsong app.

Reads tier1_seattle_birds_populated.json, downloads all audio clips and photos,
normalizes audio with ffmpeg (loudnorm, trim ≤20s, OGG Opus 96kbps),
resizes photos to 800px wide, and generates a manifest.json with local paths.

Prerequisites: Python 3, requests, Pillow, ffmpeg installed locally.
Usage: uv run python3 download_media.py
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from copy import deepcopy
from pathlib import Path

import requests
from PIL import Image

INPUT_FILE = "tier1_seattle_birds_populated.json"
OUTPUT_DIR = Path("birdsong/public/content")
AUDIO_DIR = OUTPUT_DIR / "audio"
PHOTO_DIR = OUTPUT_DIR / "photos"
MANIFEST_OUT = OUTPUT_DIR / "manifest.json"

FFMPEG_AUDIO_ARGS = [
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t", "20",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-y",
]

PHOTO_MAX_WIDTH = 800

HEADERS = {
    "User-Agent": "BirdsongApp/0.1 (https://github.com/birdsong-app; birdsong.app.dev@gmail.com) python-requests"
}

RETRY_COUNT = 3
RETRY_DELAY = 2


def get_wikimedia_download_url(commons_url: str) -> str | None:
    """Use the Wikimedia API to resolve a Commons file URL to a direct download URL.

    Wikimedia blocks direct hotlinks but allows API-resolved URLs.
    """
    # Extract filename from URL path
    # e.g. https://upload.wikimedia.org/wikipedia/commons/9/97/American_robin_%2871307%29.jpg
    # -> File:American_robin_(71307).jpg
    from urllib.parse import unquote
    path = unquote(commons_url.split("/commons/")[-1] if "/commons/" in commons_url else "")
    if "/" in path:
        filename = path.split("/", 2)[-1]  # skip hash dirs like 9/97/
    else:
        filename = path

    if not filename:
        return None

    api_url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "titles": f"File:{filename}",
        "prop": "imageinfo",
        "iiprop": "url",
        "iiurlwidth": str(PHOTO_MAX_WIDTH),  # request thumbnail at desired width
        "format": "json",
    }

    try:
        resp = requests.get(api_url, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            imageinfo = page.get("imageinfo", [{}])[0]
            # Prefer thumburl for photos (pre-resized), fall back to full url
            return imageinfo.get("thumburl") or imageinfo.get("url")
    except Exception as e:
        print(f"  Wikimedia API error for {filename}: {e}")
    return None


def download_file(url: str, dest: Path, description: str = "") -> bool:
    """Download a file with retries. Returns True on success."""
    for attempt in range(1, RETRY_COUNT + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30, stream=True)
            resp.raise_for_status()
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        except Exception as e:
            if attempt < RETRY_COUNT:
                print(f"  Retry {attempt}/{RETRY_COUNT} for {description}: {e}")
                time.sleep(RETRY_DELAY * attempt)
            else:
                print(f"  FAILED after {RETRY_COUNT} attempts: {description} — {e}")
                return False
    return False


def normalize_audio(input_path: Path, output_path: Path) -> bool:
    """Normalize audio with ffmpeg: loudnorm, trim ≤20s, OGG Opus 96kbps."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-i", str(input_path),
        *FFMPEG_AUDIO_ARGS,
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ffmpeg error for {input_path.name}: {result.stderr[-200:]}")
        return False
    return True


def resize_photo(input_path: Path, output_path: Path) -> bool:
    """Resize photo to max 800px wide, save as JPEG."""
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(input_path) as img:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            if img.width > PHOTO_MAX_WIDTH:
                ratio = PHOTO_MAX_WIDTH / img.width
                new_size = (PHOTO_MAX_WIDTH, int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            img.save(output_path, "JPEG", quality=85, optimize=True)
        return True
    except Exception as e:
        print(f"  Photo resize error: {e}")
        return False


def process_species(species: dict, manifest_species: dict) -> dict:
    """Download and process all media for one species. Returns updated manifest entry."""
    sid = species["id"]
    name = species["common_name"]
    print(f"\n[{sid}] {name}")

    # Process audio clips (songs + calls)
    for clip_type in ("songs", "calls"):
        clips = species["audio_clips"][clip_type]
        for i, clip in enumerate(clips):
            xc_id = clip["xc_id"]
            audio_url = clip["audio_url"]
            local_filename = f"{xc_id}.ogg"
            local_path = AUDIO_DIR / sid / local_filename
            local_url = f"/content/audio/{sid}/{local_filename}"

            if local_path.exists():
                print(f"  Skip (exists): {clip_type} XC{xc_id}")
                manifest_species["audio_clips"][clip_type][i]["audio_url"] = local_url
                continue

            print(f"  Downloading {clip_type} XC{xc_id}...")
            with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            if download_file(audio_url, tmp_path, f"XC{xc_id}"):
                print(f"  Normalizing XC{xc_id}...")
                if normalize_audio(tmp_path, local_path):
                    manifest_species["audio_clips"][clip_type][i]["audio_url"] = local_url
                else:
                    print(f"  WARNING: ffmpeg failed for XC{xc_id}, skipping")
            tmp_path.unlink(missing_ok=True)

    # Process Wikipedia audio
    wp_audio = species.get("wikipedia_audio", [])
    for i, wp in enumerate(wp_audio):
        wp_url = wp["url"]
        local_filename = f"wp_{i}.ogg"
        local_path = AUDIO_DIR / sid / local_filename
        local_url = f"/content/audio/{sid}/{local_filename}"

        if local_path.exists():
            print(f"  Skip (exists): wp_{i}")
            if "wikipedia_audio" in manifest_species and i < len(manifest_species["wikipedia_audio"]):
                manifest_species["wikipedia_audio"][i]["url"] = local_url
            continue

        # Resolve via Wikimedia API to avoid 403
        resolved_url = get_wikimedia_download_url(wp_url)
        if not resolved_url:
            print(f"  WARNING: Could not resolve Wikipedia audio URL for wp_{i}")
            continue

        print(f"  Downloading Wikipedia audio {i}...")
        with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        if download_file(resolved_url, tmp_path, f"wp_{i}"):
            print(f"  Normalizing wp_{i}...")
            if normalize_audio(tmp_path, local_path):
                if "wikipedia_audio" in manifest_species and i < len(manifest_species["wikipedia_audio"]):
                    manifest_species["wikipedia_audio"][i]["url"] = local_url
        tmp_path.unlink(missing_ok=True)

    # Process photo
    photo_url = species["photo"]["url"]
    local_photo = PHOTO_DIR / f"{sid}.jpg"
    local_photo_url = f"/content/photos/{sid}.jpg"

    if local_photo.exists():
        print(f"  Skip (exists): photo")
        manifest_species["photo"]["url"] = local_photo_url
    else:
        # Resolve via Wikimedia API to get a proper downloadable URL
        resolved_url = get_wikimedia_download_url(photo_url)
        if not resolved_url:
            print(f"  WARNING: Could not resolve photo URL for {sid}")
        else:
            print(f"  Downloading photo...")
            with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            if download_file(resolved_url, tmp_path, "photo"):
                if resize_photo(tmp_path, local_photo):
                    manifest_species["photo"]["url"] = local_photo_url
                else:
                    print(f"  WARNING: photo resize failed for {sid}")
            tmp_path.unlink(missing_ok=True)

    return manifest_species


def main():
    if not Path(INPUT_FILE).exists():
        print(f"Error: {INPUT_FILE} not found. Run populate_content.py first.")
        sys.exit(1)

    with open(INPUT_FILE) as f:
        data = json.load(f)

    manifest = deepcopy(data)

    # Remove fields not needed by the app
    for species in manifest["species"]:
        species.pop("xc_api_query", None)
        species.pop("wikimedia_search", None)

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)

    total = len(data["species"])
    for i, species in enumerate(data["species"]):
        print(f"\n{'='*50}")
        print(f"Processing {i+1}/{total}")
        manifest["species"][i] = process_species(species, manifest["species"][i])

    # Write local manifest
    with open(MANIFEST_OUT, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n{'='*50}")
    print(f"Manifest written to {MANIFEST_OUT}")

    # Summary
    audio_count = len(list(AUDIO_DIR.rglob("*.ogg")))
    photo_count = len(list(PHOTO_DIR.glob("*.jpg")))
    total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file()) / (1024 * 1024)
    print(f"Audio files: {audio_count}")
    print(f"Photo files: {photo_count}")
    print(f"Total size: {total_size_mb:.1f} MB")


if __name__ == "__main__":
    main()

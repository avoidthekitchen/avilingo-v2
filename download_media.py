#!/usr/bin/env python3
"""Download and process bird audio clips and photos for the birdsong app.

Usage:
    uv run download_media.py
"""

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "requests",
#     "Pillow",
# ]
# ///

import copy
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
import warnings

from pathlib import Path
from io import BytesIO

import requests
from PIL import Image

warnings.filterwarnings("ignore", category=UserWarning, module="PIL")

BASE_DIR = Path(__file__).resolve().parent
INPUT_JSON = BASE_DIR / "tier1_seattle_birds_populated.json"
OUTPUT_DIR = BASE_DIR / "birdsong" / "public" / "content"
AUDIO_DIR = OUTPUT_DIR / "audio"
PHOTO_DIR = OUTPUT_DIR / "photos"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

USER_AGENT = "AvilingoBirdsongBot/1.0 (educational; https://github.com/avilingo)"
FFMPEG_LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
MAX_DURATION_S = 20
TARGET_WIDTH_PX = 800
XC_DELAY_S = 1.0


def log(msg):
    print(msg, flush=True)


def warn(msg):
    print(f"WARNING: {msg}", flush=True)


def progress(done, total, label=""):
    bar_len = 40
    filled = int(bar_len * done / total) if total else 0
    bar = "=" * filled + "-" * (bar_len - filled)
    print(f"\r  [{bar}] {done}/{total} {label}", end="", flush=True)
    if done == total:
        print()


def download_file(url, dest_path, headers=None, timeout=60):
    if dest_path.exists():
        return True
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest_path.parent / f"{dest_path.stem}_dl{dest_path.suffix}"
    try:
        req = requests.get(url, headers=headers or {}, timeout=timeout, stream=True)
        req.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in req.iter_content(chunk_size=8192):
                f.write(chunk)
        if tmp.stat().st_size == 0:
            warn(f"Downloaded empty file from {url}")
            tmp.unlink()
            return False
        tmp.rename(dest_path)
        return True
    except Exception as e:
        warn(f"Failed to download {url}: {e}")
        if tmp.exists():
            tmp.unlink()
        return False


def ffmpeg_normalize(input_path, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = output_path.parent / f"{output_path.stem}_tmp{output_path.suffix}"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-af",
        FFMPEG_LOUDNORM,
        "-t",
        str(MAX_DURATION_S),
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-vn",
        str(tmp),
    ]
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            last_lines = result.stderr.strip().split("\n")[-3:]
            warn(f"ffmpeg failed for {input_path.name}: {'; '.join(last_lines)}")
            if tmp.exists():
                tmp.unlink()
            return False
        if not tmp.exists() or tmp.stat().st_size == 0:
            warn(f"ffmpeg produced empty output for {input_path.name}")
            return False
        tmp.rename(output_path)
        return True
    except Exception as e:
        warn(f"ffmpeg error for {input_path}: {e}")
        if tmp.exists():
            tmp.unlink()
        return False


def download_and_normalize_audio(url, dest_path, headers=None, is_xc=False):
    if dest_path.exists():
        return True
    tmp_path = dest_path.parent / f"{dest_path.stem}_raw.mp3"
    try:
        if not download_file(url, tmp_path, headers=headers):
            return False
        ok = ffmpeg_normalize(tmp_path, dest_path)
        return ok
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def download_and_resize_photo(url, dest_path):
    if dest_path.exists():
        return True
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content))
        img = img.convert("RGB")
        w, h = img.size
        if w > TARGET_WIDTH_PX:
            ratio = TARGET_WIDTH_PX / w
            new_h = int(h * ratio)
            img = img.resize((TARGET_WIDTH_PX, new_h), Image.LANCZOS)
        tmp = dest_path.parent / f"{dest_path.stem}_tmp{dest_path.suffix}"
        img.save(tmp, "JPEG", quality=85)
        tmp.rename(dest_path)
        return True
    except Exception as e:
        warn(f"Failed to download/resize photo {url}: {e}")
        return False


def main():
    log(f"Reading {INPUT_JSON}")
    with open(INPUT_JSON) as f:
        data = json.load(f)

    species_list = data["species"]
    total_species = len(species_list)

    xc_total = sum(
        len(s["audio_clips"]["songs"]) + len(s["audio_clips"]["calls"])
        for s in species_list
    )
    wp_total = sum(len(s.get("wikipedia_audio", [])) for s in species_list)
    photo_total = sum(1 for s in species_list if s.get("photo", {}).get("url"))
    log(
        f"Found {total_species} species: {xc_total} XC clips, {wp_total} WP audio, {photo_total} photos"
    )

    xc_done = 0
    wp_done = 0
    photo_done = 0
    xc_ok = 0
    wp_ok = 0
    photo_ok = 0

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    log("\n--- Downloading Xeno-canto audio clips ---")
    last_xc_time = 0.0
    for sp in species_list:
        species_id = sp["id"]
        all_clips = list(sp["audio_clips"]["songs"]) + list(sp["audio_clips"]["calls"])
        for clip in all_clips:
            xc_done += 1
            xc_id = clip["xc_id"]
            dest = AUDIO_DIR / species_id / f"{xc_id}.ogg"
            if dest.exists():
                xc_ok += 1
                progress(xc_done, xc_total, f"XC {species_id}/{xc_id} (cached)")
                continue
            now = time.monotonic()
            wait = XC_DELAY_S - (now - last_xc_time)
            if wait > 0:
                time.sleep(wait)
            last_xc_time = time.monotonic()
            ok = download_and_normalize_audio(
                clip["audio_url"],
                dest,
                headers={
                    "User-Agent": USER_AGENT,
                    "Referer": "https://xeno-canto.org/",
                },
                is_xc=True,
            )
            if ok:
                xc_ok += 1
            progress(
                xc_done, xc_total, f"XC {species_id}/{xc_id} {'OK' if ok else 'FAIL'}"
            )

    log(f"\nXC audio: {xc_ok}/{xc_total} downloaded successfully")

    log("\n--- Downloading Wikipedia audio clips ---")
    for sp in species_list:
        species_id = sp["id"]
        wp_clips = sp.get("wikipedia_audio", [])
        for idx, clip in enumerate(wp_clips):
            wp_done += 1
            dest = AUDIO_DIR / species_id / f"wp_{idx}.ogg"
            if dest.exists():
                wp_ok += 1
                progress(wp_done, wp_total, f"WP {species_id}/wp_{idx} (cached)")
                continue
            ok = download_and_normalize_audio(
                clip["url"],
                dest,
                headers={"User-Agent": USER_AGENT},
            )
            if ok:
                wp_ok += 1
            progress(
                wp_done, wp_total, f"WP {species_id}/wp_{idx} {'OK' if ok else 'FAIL'}"
            )

    log(f"\nWikipedia audio: {wp_ok}/{wp_total} downloaded successfully")

    log("\n--- Downloading photos ---")
    for sp in species_list:
        species_id = sp["id"]
        photo = sp.get("photo", {})
        url = photo.get("url")
        if not url:
            continue
        photo_done += 1
        dest = PHOTO_DIR / f"{species_id}.jpg"
        if dest.exists():
            photo_ok += 1
            progress(photo_done, photo_total, f"Photo {species_id} (cached)")
            continue
        ok = download_and_resize_photo(url, dest)
        if ok:
            photo_ok += 1
        progress(
            photo_done, photo_total, f"Photo {species_id} {'OK' if ok else 'FAIL'}"
        )

    log(f"\nPhotos: {photo_ok}/{photo_total} downloaded successfully")

    log("\n--- Generating manifest.json ---")
    manifest = copy.deepcopy(data)
    for sp in manifest["species"]:
        species_id = sp["id"]
        for clip in sp["audio_clips"]["songs"]:
            clip["audio_url"] = f"/content/audio/{species_id}/{clip['xc_id']}.ogg"
        for clip in sp["audio_clips"]["calls"]:
            clip["audio_url"] = f"/content/audio/{species_id}/{clip['xc_id']}.ogg"
        if sp.get("photo", {}).get("url"):
            sp["photo"]["url"] = f"/content/photos/{species_id}.jpg"
        for idx, clip in enumerate(sp.get("wikipedia_audio", [])):
            clip["url"] = f"/content/audio/{species_id}/wp_{idx}.ogg"

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_manifest = MANIFEST_PATH.parent / "manifest_tmp.json"
    with open(tmp_manifest, "w") as f:
        json.dump(manifest, f, indent=2)
    tmp_manifest.rename(MANIFEST_PATH)
    log(f"Wrote {MANIFEST_PATH}")

    log("\n=== Summary ===")
    log(f"  XC audio:   {xc_ok}/{xc_total}")
    log(f"  WP audio:   {wp_ok}/{wp_total}")
    log(f"  Photos:     {photo_ok}/{photo_total}")
    total = xc_total + wp_total + photo_total
    total_ok = xc_ok + wp_ok + photo_ok
    log(f"  Total:      {total_ok}/{total}")
    if total_ok < total:
        log(
            f"\n  {total - total_ok} downloads failed — re-run to retry (script is idempotent)"
        )
        sys.exit(1)
    log("\nAll done!")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Download and normalize all audio/photo assets for the BeakSpeak app.

Reads tier1_seattle_birds_populated.json, downloads all audio clips and photos,
normalizes audio with ffmpeg (loudnorm, trim ≤20s, OGG Opus 96kbps),
resizes photos to 800px wide, and generates a manifest.json with local paths.

Prerequisites: Python 3, requests, Pillow, ffmpeg installed locally.
Usage: uv run python3 download_media.py [--manifest-only]
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from copy import deepcopy
from pathlib import Path

import requests
from PIL import Image

INPUT_FILE = "tier1_seattle_birds_populated.json"
OUTPUT_DIR = Path("beakspeak/public/content")
AUDIO_DIR = OUTPUT_DIR / "audio"
PHOTO_DIR = OUTPUT_DIR / "photos"
MANIFEST_OUT = OUTPUT_DIR / "manifest.json"

PHOTO_MAX_WIDTH = 800

HEADERS = {
    "User-Agent": "BeakSpeakApp/0.1 (https://github.com/avoidthekitchen; mistercheese@gmail.com) python-requests"
}

RETRY_COUNT = 3
RETRY_DELAY = 2
BIRDNET_MIN_CONFIDENCE = 0.15
BIRDNET_MIN_DURATION = 5.0
BIRDNET_PADDING = 0.75
BIRDNET_CLUSTER_GAP = 0.5
BIRDNET_TRIM_EPSILON = 0.25


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


def detect_best_segment(input_path: Path) -> tuple[float, float] | None:
    """Run ffmpeg silencedetect to find the best active audio segment.

    Returns (start, duration) for the first non-silent segment ≥ 5s,
    with 0.5s padding before onset and capped at 20s.
    Returns None if detection fails or no suitable segment is found.
    """
    cmd = [
        "ffmpeg", "-i", str(input_path),
        "-af", "silencedetect=noise=-30dB:d=0.5",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None

    # Parse silence_start / silence_end from stderr
    silence_starts = []
    silence_ends = []
    for line in result.stderr.splitlines():
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            silence_starts.append(float(m.group(1)))
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m:
            silence_ends.append(float(m.group(1)))

    if not silence_starts and not silence_ends:
        # No silence detected — entire clip is active, fallback
        return None

    # Get total duration from ffmpeg output
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", result.stderr)
    if duration_match:
        h, m_val, s, cs = duration_match.groups()
        total_duration = int(h) * 3600 + int(m_val) * 60 + int(s) + int(cs) / 100
    else:
        total_duration = 0.0

    # Build list of non-silent segments
    # Non-silent regions are gaps between silence regions
    segments: list[tuple[float, float]] = []

    # Region before first silence
    if silence_starts and silence_starts[0] > 0:
        segments.append((0.0, silence_starts[0]))

    # Regions between silence_end[i] and silence_start[i+1]
    for i, end in enumerate(silence_ends):
        next_start = silence_starts[i + 1] if i + 1 < len(silence_starts) else total_duration
        if next_start > end:
            segments.append((end, next_start))

    # Find first segment ≥ 5s
    for seg_start, seg_end in segments:
        seg_length = seg_end - seg_start
        if seg_length >= 5.0:
            # Apply 0.5s padding before onset, clamped to 0
            start = max(0.0, seg_start - 0.5)
            duration = min(seg_length + 0.5, 20.0)
            return (start, duration)

    return None


def get_audio_duration(path: Path) -> float | None:
    """Return clip duration in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def read_birdnet_rows(csv_path: Path) -> list[dict]:
    """Load BirdNET detections with parsed numeric fields."""
    rows = []
    try:
        with csv_path.open(newline="") as f:
            for row in csv.DictReader(f):
                try:
                    rows.append({
                        "start": float(row.get("Start (s)", "0") or 0),
                        "end": float(row.get("End (s)", "0") or 0),
                        "scientific_name": row.get("Scientific name", "") or "",
                        "common_name": row.get("Common name", "") or "",
                        "confidence": float(row.get("Confidence", "0") or 0),
                        "file": row.get("File", "") or "",
                    })
                except ValueError:
                    continue
    except FileNotFoundError:
        return []
    return rows


def select_birdnet_segment(
    rows: list[dict],
    target_common_name: str,
    target_scientific_name: str,
    clip_duration: float,
) -> tuple[float, float] | None:
    """Pick the strongest contiguous target-species window from BirdNET results."""
    target_rows = [
        row for row in rows
        if row["confidence"] >= BIRDNET_MIN_CONFIDENCE
        and (
            row["common_name"] == target_common_name
            or row["scientific_name"] == target_scientific_name
        )
    ]
    if not target_rows:
        return None

    target_rows.sort(key=lambda row: (row["start"], row["end"]))
    clusters: list[list[dict]] = []
    current_cluster: list[dict] = []

    for row in target_rows:
        if not current_cluster:
            current_cluster = [row]
            continue
        prev_end = current_cluster[-1]["end"]
        if row["start"] - prev_end <= BIRDNET_CLUSTER_GAP:
            current_cluster.append(row)
        else:
            clusters.append(current_cluster)
            current_cluster = [row]
    if current_cluster:
        clusters.append(current_cluster)

    best_cluster = max(
        clusters,
        key=lambda cluster: (
            sum(row["confidence"] for row in cluster),
            -(cluster[-1]["end"] - cluster[0]["start"]),
            -cluster[0]["start"],
        ),
    )

    cluster_start = best_cluster[0]["start"]
    cluster_end = best_cluster[-1]["end"]
    trim_start = max(0.0, cluster_start - BIRDNET_PADDING)
    trim_end = min(clip_duration, cluster_end + BIRDNET_PADDING)

    if trim_end - trim_start < BIRDNET_MIN_DURATION:
        deficit = BIRDNET_MIN_DURATION - (trim_end - trim_start)
        extend_before = min(trim_start, deficit / 2)
        extend_after = min(clip_duration - trim_end, deficit - extend_before)
        trim_start -= extend_before
        trim_end += extend_after
        if trim_end - trim_start < BIRDNET_MIN_DURATION:
            trim_start = max(0.0, trim_end - BIRDNET_MIN_DURATION)
            trim_end = min(clip_duration, trim_start + BIRDNET_MIN_DURATION)

    trim_duration = max(0.0, trim_end - trim_start)
    if trim_start <= BIRDNET_TRIM_EPSILON and clip_duration - trim_end <= BIRDNET_TRIM_EPSILON:
        return None
    if trim_duration <= 0:
        return None
    return (trim_start, trim_duration)


def rewrite_birdnet_csv(csv_path: Path, rows: list[dict], audio_path: Path, trim_start: float, trim_duration: float) -> None:
    """Rewrite BirdNET rows into the trimmed clip timebase."""
    trim_end = trim_start + trim_duration
    kept_rows = []
    for row in rows:
        overlap_start = max(trim_start, row["start"])
        overlap_end = min(trim_end, row["end"])
        if overlap_end <= overlap_start:
            continue
        kept_rows.append({
            "Start (s)": f"{max(0.0, overlap_start - trim_start):.4f}".rstrip("0").rstrip("."),
            "End (s)": f"{min(trim_duration, overlap_end - trim_start):.4f}".rstrip("0").rstrip("."),
            "Scientific name": row["scientific_name"],
            "Common name": row["common_name"],
            "Confidence": f"{row['confidence']:.4f}",
            "File": str(audio_path.resolve()),
        })

    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Start (s)", "End (s)", "Scientific name", "Common name", "Confidence", "File"],
        )
        writer.writeheader()
        writer.writerows(kept_rows)


def refine_audio_with_birdnet(audio_path: Path, species: dict, clip: dict) -> bool:
    """Tighten an existing local clip using adjacent BirdNET detections when available."""
    csv_path = audio_path.with_suffix(".BirdNET.results.csv")
    if not audio_path.exists() or not csv_path.exists():
        return False

    rows = read_birdnet_rows(csv_path)
    if not rows:
        return False

    clip_duration = get_audio_duration(audio_path)
    if clip_duration is None or clip_duration <= 0:
        return False

    segment = select_birdnet_segment(
        rows,
        species.get("common_name", ""),
        species.get("scientific_name", ""),
        clip_duration,
    )
    if segment is None:
        return False

    trim_start, trim_duration = segment
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    cmd = [
        "ffmpeg", "-i", str(audio_path),
        "-ss", str(trim_start), "-t", str(trim_duration),
        "-c:a", "libopus",
        "-b:a", "96k",
        "-y",
        str(tmp_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  BirdNET trim failed for {audio_path.name}: {result.stderr[-200:]}")
        tmp_path.unlink(missing_ok=True)
        return False

    tmp_path.replace(audio_path)
    rewrite_birdnet_csv(csv_path, rows, audio_path, trim_start, trim_duration)
    print(f"  BirdNET trim: {trim_start:.1f}s-{trim_start + trim_duration:.1f}s")
    return True


def normalize_audio(input_path: Path, output_path: Path) -> bool:
    """Normalize audio with ffmpeg: smart trim, loudnorm, OGG Opus 96kbps."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Try smart trimming first
    segment = detect_best_segment(input_path)

    if segment is not None:
        start, duration = segment
        trim_args = ["-ss", str(start), "-t", str(duration)]
        print(f"  Smart trim: {start:.1f}s-{start + duration:.1f}s")
    else:
        trim_args = ["-t", "20"]
        print(f"  Default trim: 0-20s")

    cmd = [
        "ffmpeg", "-i", str(input_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        *trim_args,
        "-c:a", "libopus",
        "-b:a", "96k",
        "-y",
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


def process_species(species: dict, manifest_species: dict, manifest_only: bool = False) -> dict:
    """Download and process all media for one species. Returns updated manifest entry."""
    sid = species["id"]
    name = species["common_name"]
    print(f"\n[{sid}] {name}")

    # Process audio clips (songs + calls) — download ALL candidates for admin preview
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
                if not manifest_only:
                    refine_audio_with_birdnet(local_path, species, clip)
                continue

            if manifest_only:
                print(f"  WARNING: missing local {clip_type} XC{xc_id}; leaving source URL in manifest candidate data")
                continue

            print(f"  Downloading {clip_type} XC{xc_id}...")
            with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            if download_file(audio_url, tmp_path, f"XC{xc_id}"):
                print(f"  Normalizing XC{xc_id}...")
                if normalize_audio(tmp_path, local_path):
                    manifest_species["audio_clips"][clip_type][i]["audio_url"] = local_url
                    refine_audio_with_birdnet(local_path, species, clip)
                else:
                    print(f"  WARNING: ffmpeg failed for XC{xc_id}, skipping")
            tmp_path.unlink(missing_ok=True)

    # Filter manifest clips to selected-only; strip the selected field (app doesn't need it)
    for clip_type in ("songs", "calls"):
        kept = []
        for clip in manifest_species["audio_clips"][clip_type]:
            if clip.get("selected", True):
                clip_copy = {k: v for k, v in clip.items() if k != "selected"}
                kept.append(clip_copy)
        manifest_species["audio_clips"][clip_type] = kept

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

        if manifest_only:
            print(f"  WARNING: missing local wp_{i}; leaving source URL in manifest candidate data")
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
        if manifest_only:
            print(f"  WARNING: missing local photo for {sid}; leaving source URL in manifest candidate data")
            return manifest_species

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="Rebuild manifest.json from current selections and existing local media only; do not download or re-trim assets.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
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
        manifest["species"][i] = process_species(
            species,
            manifest["species"][i],
            manifest_only=args.manifest_only,
        )

    # Write local manifest
    with open(MANIFEST_OUT, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n{'='*50}")
    print(f"Manifest written to {MANIFEST_OUT}")
    if args.manifest_only:
        print("Mode: manifest-only (no downloads, no normalization, no BirdNET refinement)")

    # Summary
    audio_count = len(list(AUDIO_DIR.rglob("*.ogg")))
    photo_count = len(list(PHOTO_DIR.glob("*.jpg")))
    total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file()) / (1024 * 1024)
    print(f"Audio files: {audio_count}")
    print(f"Photo files: {photo_count}")
    print(f"Total size: {total_size_mb:.1f} MB")


if __name__ == "__main__":
    main()

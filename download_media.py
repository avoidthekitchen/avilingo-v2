#!/usr/bin/env python3
"""Download and normalize all audio/photo assets for the BeakSpeak app.

Reads tier1_seattle_birds_populated.json, downloads all audio clips and photos,
normalizes audio with ffmpeg (loudnorm, trim ≤20s, OGG Opus 96kbps),
resizes photos to 800px wide, and generates a manifest.json with local paths.

Prerequisites: Python 3, requests, Pillow, ffmpeg installed locally.
Usage: uv run python3 download_media.py
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from copy import deepcopy
from pathlib import Path

import requests
from PIL import Image

from populate_content import build_export_audio_clips, load_pool_file, normalize_audio_clips

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--export-mode",
        choices=("all", "commercial"),
        default="all",
        help="Resolve curated audio assignments for the final manifest using the requested license mode.",
    )
    return parser.parse_args()


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


def normalize_audio(input_path: Path, output_path: Path, segment: dict | None = None) -> bool:
    """Normalize audio with ffmpeg, honoring persisted segment windows when available."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    stored_start = segment.get("start_s") if isinstance(segment, dict) else None
    stored_duration = segment.get("duration_s") if isinstance(segment, dict) else None
    if stored_start is not None and stored_duration is not None:
        trim_args = ["-ss", str(stored_start), "-t", str(stored_duration)]
        print(f"  Stored segment: {stored_start:.1f}s-{stored_start + stored_duration:.1f}s")
    else:
        detected_segment = detect_best_segment(input_path)
        if detected_segment is not None:
            start, duration = detected_segment
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


def process_species(species: dict, manifest_species: dict, export_mode: str) -> tuple[dict, dict]:
    """Download and process all media for one species."""
    sid = species["id"]
    name = species["common_name"]
    print(f"\n[{sid}] {name}")

    species_audio = normalize_audio_clips(species.get("audio_clips"))
    species_candidates = {
        candidate["candidate_id"]: candidate
        for candidate in species_audio.get("candidates", [])
    }

    # Download all candidates so the admin can preview the full mixed pool locally.
    for candidate in species_audio.get("candidates", []):
        xc_id = candidate["xc_id"]
        audio_url = candidate["audio_url"]
        local_filename = f"{xc_id}.ogg"
        local_path = AUDIO_DIR / sid / local_filename
        local_url = f"/content/audio/{sid}/{local_filename}"
        species_candidate = species_candidates.get(candidate["candidate_id"])

        if local_path.exists():
            print(f"  Skip (exists): {candidate['source_role']} XC{xc_id}")
            if species_candidate is not None:
                species_candidate["audio_url"] = local_url
            continue

        print(f"  Downloading {candidate['source_role']} XC{xc_id}...")
        with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        if download_file(audio_url, tmp_path, f"XC{xc_id}"):
            print(f"  Normalizing XC{xc_id}...")
            if normalize_audio(tmp_path, local_path, segment=candidate.get("segment")):
                if species_candidate is not None:
                    species_candidate["audio_url"] = local_url
            else:
                print(f"  WARNING: ffmpeg failed for XC{xc_id}, skipping")
        tmp_path.unlink(missing_ok=True)

    export_report = build_export_audio_clips(
        species_audio,
        export_mode=export_mode,
    )
    manifest_species["audio_clips"] = export_report["audio_clips"]
    for warning in export_report["warnings"]:
        print(f"  Export warning: {warning}")
    for error in export_report["errors"]:
        print(f"  Export error: {error}")

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

    return manifest_species, export_report


def main():
    args = parse_args()
    if not Path(INPUT_FILE).exists():
        print(f"Error: {INPUT_FILE} not found. Run populate_content.py first.")
        sys.exit(1)

    data = load_pool_file(INPUT_FILE)

    manifest = deepcopy(data)

    # Remove fields not needed by the app
    for species in manifest["species"]:
        species.pop("xc_api_query", None)
        species.pop("wikimedia_search", None)

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Export mode: {args.export_mode}")
    total = len(data["species"])
    export_reports = []
    for i, species in enumerate(data["species"]):
        print(f"\n{'='*50}")
        print(f"Processing {i+1}/{total}")
        manifest_species, export_report = process_species(
            species,
            manifest["species"][i],
            export_mode=args.export_mode,
        )
        manifest["species"][i] = manifest_species
        export_reports.append({
            "name": species["common_name"],
            **export_report,
        })

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

    substitutions = [
        (report["name"], substitution)
        for report in export_reports
        for substitution in report.get("substitutions", [])
    ]
    warnings = [
        (report["name"], warning)
        for report in export_reports
        for warning in report.get("warnings", [])
    ]
    errors = [
        (report["name"], error)
        for report in export_reports
        for error in report.get("errors", [])
    ]

    if substitutions:
        print("Commercial substitutions:")
        for species_name, substitution in substitutions:
            print(
                f"  {species_name}: {substitution['role']} XC{substitution['selected_xc_id']} "
                f"-> XC{substitution['substitute_xc_id']}"
            )
    if warnings:
        print("Export warnings:")
        for species_name, warning in warnings:
            print(f"  {species_name}: {warning}")
    if errors:
        print("Export errors:")
        for species_name, error in errors:
            print(f"  {species_name}: {error}")


if __name__ == "__main__":
    main()

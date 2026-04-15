#!/usr/bin/env python3
"""
populate_content.py — Run locally to populate photos + audio in the manifest.

Sources:
  - Photos: Wikipedia API (infobox/page image) — CC-BY-SA
  - Audio:  Xeno-canto API (top-quality recordings) — CC-BY/CC-BY-NC

Usage:
    uv run python3 populate_content.py
    (requires XC_API_KEY env var — get key at https://xeno-canto.org/account)

Reads tier1_seattle_birds.json, queries both APIs, writes
tier1_seattle_birds_populated.json with filled photo + audio_clips fields.
"""

import json
import os
import time
import sys
import re
import requests
from pathlib import Path
from urllib.parse import quote

XC_API_KEY = os.environ.get("XC_API_KEY", "")
if not XC_API_KEY:
    print("Error: XC_API_KEY environment variable not set.")
    print("Get your key at https://xeno-canto.org/account and add it to your shell profile.")
    sys.exit(1)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "BeakSpeakApp/0.1 (educational bird sound learning app; contact: mistercheese@gmail.com)"
})


# ═══════════════════════════════════════════════════════════════════
# WIKIPEDIA: Infobox photo + any embedded audio files
# ═══════════════════════════════════════════════════════════════════

def get_wikipedia_title(common_name: str) -> str | None:
    """Search Wikipedia for the bird and return the canonical page title."""
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": common_name,
        "srlimit": 1,
    }
    try:
        resp = SESSION.get("https://en.wikipedia.org/w/api.php", params=params, timeout=10)
        data = resp.json()
        results = data.get("query", {}).get("search", [])
        if results:
            return results[0]["title"]
    except Exception as e:
        print(f"    ⚠ Wikipedia search error: {e}")
    return None


def get_wikipedia_page_image(title: str) -> dict | None:
    """Get the main page image (usually the infobox photo) from Wikipedia."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "pageimages|imageinfo",
        "piprop": "original|name",
        "iiprop": "url|extmetadata",
    }
    try:
        resp = SESSION.get("https://en.wikipedia.org/w/api.php", params=params, timeout=10)
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            original = page.get("original", {})
            if original.get("source"):
                return {
                    "url": original["source"],
                    "width": original.get("width"),
                    "height": original.get("height"),
                    "filename": page.get("pageimage", ""),
                    "source": "wikipedia_infobox",
                    "license": "CC-BY-SA (Wikipedia)",
                    "wikipedia_page": f"https://en.wikipedia.org/wiki/{quote(title)}",
                }
    except Exception as e:
        print(f"    ⚠ Wikipedia image error: {e}")
    return None


def get_wikipedia_audio_files(title: str) -> list[dict]:
    """Get any audio files embedded on the Wikipedia page."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "images",
        "imlimit": 50,
    }
    audio_extensions = {".ogg", ".oga", ".mp3", ".wav", ".flac", ".opus"}
    audio_files = []

    try:
        resp = SESSION.get("https://en.wikipedia.org/w/api.php", params=params, timeout=10)
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            for img in page.get("images", []):
                file_title = img.get("title", "")
                ext = Path(file_title).suffix.lower()
                if ext in audio_extensions:
                    audio_files.append(file_title)
    except Exception as e:
        print(f"    ⚠ Wikipedia audio list error: {e}")

    # Get actual URLs for found audio files
    results = []
    for file_title in audio_files:
        url = get_commons_file_url(file_title)
        if url:
            results.append({
                "url": url,
                "filename": file_title,
                "source": "wikimedia_commons",
                "license": "CC (see Commons page)",
                "commons_page": f"https://commons.wikimedia.org/wiki/{quote(file_title)}",
            })
        time.sleep(0.3)

    return results


def get_commons_file_url(file_title: str) -> str | None:
    """Get the direct URL for a Wikimedia Commons file."""
    params = {
        "action": "query",
        "format": "json",
        "titles": file_title,
        "prop": "imageinfo",
        "iiprop": "url",
    }
    try:
        resp = SESSION.get("https://commons.wikimedia.org/w/api.php", params=params, timeout=10)
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            imageinfo = page.get("imageinfo", [{}])
            if imageinfo:
                return imageinfo[0].get("url")
    except Exception as e:
        print(f"    ⚠ Commons URL error for {file_title}: {e}")
    return None


# ═══════════════════════════════════════════════════════════════════
# XENO-CANTO: Audio recordings
# ═══════════════════════════════════════════════════════════════════

def is_license_ok(lic_url: str) -> bool:
    """Accept CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA, CC0. Reject ND."""
    if not lic_url:
        return False
    norm = lic_url.lower()
    if "-nd" in norm:
        return False
    return any(k in norm for k in [
        "creativecommons.org/licenses/by",
        "creativecommons.org/publicdomain/zero",
    ])


def score_recording(rec: dict) -> float:
    """Score: quality + location + length. Higher = better."""
    score = {"A": 5, "B": 3, "C": 1, "D": -1, "E": -3}.get(rec.get("q", ""), 0)

    loc = f"{rec.get('loc', '')} {rec.get('cnt', '')}".lower()
    if "washington" in loc:
        score += 4
    elif any(s in loc for s in ["oregon", "british columbia", "idaho"]):
        score += 2
    elif "california" in loc:
        score += 0.5

    try:
        parts = rec.get("length", "0:00").split(":")
        secs = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 999
        if 5 <= secs <= 30:
            score += 2
        elif 30 < secs <= 60:
            score += 1
        elif secs > 120:
            score -= 1
    except (ValueError, IndexError):
        pass

    if rec.get("rmk"):
        score += 0.5

    return score


def query_xc(scientific_name: str, max_pages: int = 3) -> list[dict]:
    """Query Xeno-canto API for recordings of a species."""
    all_recs = []
    parts = scientific_name.split(None, 1)
    genus = parts[0] if parts else scientific_name
    species = parts[1] if len(parts) > 1 else ""
    for page in range(1, max_pages + 1):
        query = f'gen:{genus} sp:{species} cnt:"United States"'
        try:
            resp = SESSION.get(
                "https://xeno-canto.org/api/3/recordings",
                params={"query": query, "page": page, "key": XC_API_KEY},
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
            all_recs.extend(data.get("recordings", []))
            if page >= int(data.get("numPages", 1)):
                break
        except Exception as e:
            print(f"    ⚠ XC API error (page {page}): {e}")
            break
        time.sleep(1.2)
    return all_recs


def select_xc_clips(recordings: list[dict], clip_type: str, n: int) -> list[dict]:
    """Filter by vocalization type, score, return top N."""
    typed = [r for r in recordings if clip_type in r.get("type", "").lower()]
    ranked = sorted(typed, key=score_recording, reverse=True)
    return [
        {
            "xc_id": r.get("id", ""),
            "xc_url": f"https://xeno-canto.org/{r.get('id', '')}",
            "audio_url": r.get("file", ""),
            "type": r.get("type", ""),
            "quality": r.get("q", ""),
            "length": r.get("length", ""),
            "recordist": r.get("rec", ""),
            "license": r.get("lic", ""),
            "location": r.get("loc", ""),
            "country": r.get("cnt", ""),
            "score": round(score_recording(r), 1),
        }
        for r in ranked[:n]
    ]


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def process_species(sp: dict) -> None:
    """Populate one species entry with photo + audio."""
    name = sp["common_name"]
    sci = sp["scientific_name"]
    print(f"\n{'─'*50}")
    print(f"  {name} ({sci})")
    print(f"{'─'*50}")

    # ── Wikipedia photo ────────────────────────────────────────
    print("  [Wikipedia] Searching for page...")
    wiki_title = get_wikipedia_title(f"{name} bird")
    if wiki_title:
        print(f"  [Wikipedia] Found: {wiki_title}")

        # Infobox photo
        photo = get_wikipedia_page_image(wiki_title)
        if photo:
            sp["photo"] = photo
            print(f"  [Wikipedia] ✓ Photo: {photo['filename']}")
        else:
            print(f"  [Wikipedia] ✗ No page image found")

        # Bonus: any audio files on the Wikipedia page
        time.sleep(0.5)
        wiki_audio = get_wikipedia_audio_files(wiki_title)
        if wiki_audio:
            sp["wikipedia_audio"] = wiki_audio
            print(f"  [Wikipedia] ✓ Found {len(wiki_audio)} audio file(s) on page")
        else:
            print(f"  [Wikipedia] No audio files on page (normal — XC is the primary source)")
    else:
        print(f"  [Wikipedia] ✗ Page not found")

    time.sleep(0.5)

    # ── Xeno-canto audio ──────────────────────────────────────
    print(f"  [Xeno-canto] Querying recordings...")
    recs = query_xc(sci)
    print(f"  [Xeno-canto] Found {len(recs)} total recordings")

    # Filter
    recs = [r for r in recs if is_license_ok(r.get("lic", ""))]
    print(f"  [Xeno-canto] After license filter: {len(recs)}")

    quality = [r for r in recs if r.get("q") in ("A", "B")]
    if len(quality) < 3:
        quality = [r for r in recs if r.get("q") in ("A", "B", "C")]
        print(f"  [Xeno-canto] Relaxed quality to A/B/C: {len(quality)}")
    else:
        print(f"  [Xeno-canto] Quality A/B: {len(quality)}")

    songs = select_xc_clips(quality, "song", 3)
    calls = select_xc_clips(quality, "call", 2)

    # Fallback: use top recordings regardless of type
    if not songs:
        fallback = sorted(quality, key=score_recording, reverse=True)[:3]
        songs = [
            {
                "xc_id": r.get("id", ""),
                "xc_url": f"https://xeno-canto.org/{r.get('id', '')}",
                "audio_url": r.get("file", ""),
                "type": r.get("type", "unspecified"),
                "quality": r.get("q", ""),
                "length": r.get("length", ""),
                "recordist": r.get("rec", ""),
                "license": r.get("lic", ""),
                "location": r.get("loc", ""),
                "country": r.get("cnt", ""),
                "score": round(score_recording(r), 1),
            }
            for r in fallback
        ]
        if songs:
            print(f"  [Xeno-canto] ⚠ No typed songs — used top {len(songs)} untyped")

    sp["audio_clips"] = {"songs": songs, "calls": calls}
    print(f"  [Xeno-canto] ✓ Selected {len(songs)} songs, {len(calls)} calls")

    if not songs and not calls:
        print(f"  ✗ NO AUDIO FOUND — manual curation needed for this species")


def main():
    manifest_path = Path(__file__).parent / "tier1_seattle_birds.json"
    if not manifest_path.exists():
        print(f"Error: {manifest_path} not found.")
        print(f"Place tier1_seattle_birds.json next to this script.")
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    species = manifest["species"]
    print("=" * 60)
    print("  BeakSpeak — Content Population")
    print("=" * 60)
    print(f"  Species: {len(species)}")
    print(f"  Photo source: Wikipedia infobox (CC-BY-SA)")
    print(f"  Audio source: Xeno-canto (CC-BY/NC, quality A/B)")
    print(f"  Region bias: Washington > PNW > US")
    print("=" * 60)

    for i, sp in enumerate(species, 1):
        print(f"\n[{i}/{len(species)}]", end="")
        process_species(sp)
        time.sleep(1.0)

    # ── Summary ───────────────────────────────────────────────
    photos_found = sum(1 for s in species if s.get("photo", {}).get("url"))
    songs_total = sum(len(s.get("audio_clips", {}).get("songs", [])) for s in species)
    calls_total = sum(len(s.get("audio_clips", {}).get("calls", [])) for s in species)
    wiki_audio = sum(len(s.get("wikipedia_audio", [])) for s in species)
    no_audio = sum(1 for s in species
                   if not s.get("audio_clips", {}).get("songs")
                   and not s.get("audio_clips", {}).get("calls"))

    out_path = manifest_path.parent / "tier1_seattle_birds_populated.json"
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n\n{'='*60}")
    print(f"  RESULTS")
    print(f"{'='*60}")
    print(f"  Wikipedia photos found:   {photos_found}/{len(species)}")
    print(f"  Wikipedia audio bonus:    {wiki_audio} files")
    print(f"  Xeno-canto songs:         {songs_total}")
    print(f"  Xeno-canto calls:         {calls_total}")
    print(f"  Species needing manual:   {no_audio}")
    print(f"{'='*60}")
    print(f"  Output: {out_path}")
    print()

    if no_audio:
        print("  Species missing audio:")
        for s in species:
            clips = s.get("audio_clips", {})
            if not clips.get("songs") and not clips.get("calls"):
                print(f"    - {s['common_name']}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
populate_content.py — Run locally to populate photos + audio in the manifest.

Sources:
  - Photos: Wikipedia API (infobox/page image) — CC-BY-SA
  - Audio:  Xeno-canto API (top-quality recordings) — Prefer CC-BY, CC-BY-SA, CC0 (commercial OK); fallback to CC-BY-NC, CC-BY-NC-SA if needed

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

def is_commercial_license(lic_url: str) -> bool:
    """Accept CC-BY, CC-BY-SA, CC0 only. Reject NC and ND variants."""
    if not lic_url:
        return False
    norm = lic_url.lower()
    if "-nc" in norm or "-nd" in norm:
        return False
    return any(k in norm for k in [
        "creativecommons.org/licenses/by",
        "creativecommons.org/publicdomain/zero",
    ])


def is_any_cc_license(lic_url: str) -> bool:
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


def filter_background_species(recordings: list[dict]) -> list[dict]:
    """Exclude recordings where the `also` field lists background species."""
    def _also_empty(r):
        # XC sometimes returns "also": null, so coalesce to "" before string ops
        also = r.get("also") or ""
        return not also if isinstance(also, list) else not also.strip()
    return [r for r in recordings if _also_empty(r)]


def score_recording(rec: dict) -> float:
    """Score: quality + location + length + remarks + animal-seen + stage + method - playback. Higher = better."""
    score = {"A": 50, "B": 30, "C": 10, "D": -10, "E": -30}.get(rec.get("q", ""), 0)

    loc = f"{rec.get('loc', '')} {rec.get('cnt', '')}".lower()
    if "washington" in loc:
        score += 0.4
    elif any(s in loc for s in ["oregon", "british columbia", "idaho"]):
        score += 0.2
    elif "california" in loc:
        score += 0.05

    try:
        parts = rec.get("length", "0:00").split(":")
        secs = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 999
        if 5 <= secs <= 15:
            score += 3
        elif 15 < secs <= 30:
            score += 1
        elif 30 < secs <= 60:
            score -= 1
        elif secs > 60:
            score -= 3
    except (ValueError, IndexError):
        pass

    if rec.get("rmk"):
        score += 5

    if rec.get("animal-seen", "").lower() == "yes":
        score += 3

    if rec.get("playback-used", "").lower() == "yes":
        score -= 5

    stage = rec.get("stage", "").lower()
    if stage == "adult":
        score += 3
    elif stage in ("juvenile", "nestling"):
        score -= 5

    method = rec.get("method", "").lower()
    if method == "field recording":
        score += 3
    elif method in ("in the hand", "in net", "studio recording"):
        score -= 5

    return score


def query_xc(scientific_name: str, max_pages: int = 2) -> list[dict]:
    """Query Xeno-canto API for recordings of a species."""
    all_recs = []
    parts = scientific_name.split(None, 1)
    genus = parts[0] if parts else scientific_name
    species = parts[1] if len(parts) > 1 else ""
    for page in range(1, max_pages + 1):
        # area:america broadens the pool beyond US; quality dominates scoring,
        # so location acts only as a small tiebreaker (WA +0.4, PNW +0.2, CA +0.05).
        # q:">D" keeps A/B/C so the client-side A/B-then-A/B/C fallback can still kick in.
        query = f'gen:{genus} sp:{species} area:america q:">D"'
        try:
            resp = SESSION.get(
                "https://xeno-canto.org/api/3/recordings",
                params={"query": query, "page": page, "per_page": 500, "key": XC_API_KEY},
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


def select_xc_clips(recordings: list[dict], clip_type: str, n: int,
                    commercial_ok: bool = True, exclude_ids: set | None = None) -> list[dict]:
    """Filter by vocalization type, score, return top N with commercial_ok flag.

    Tokenizes `type` on comma so 'song' substring match doesn't leak from 'subsong',
    and so compound types like 'begging call, subsong' are excluded entirely.
    """
    exclude_ids = exclude_ids or set()
    def _matches(r):
        if r.get("id", "") in exclude_ids:
            return False
        tokens = [t.strip() for t in r.get("type", "").lower().split(",")]
        if any("subsong" in t for t in tokens):
            return False
        return any(clip_type in t for t in tokens)
    typed = [r for r in recordings if _matches(r)]
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
            "commercial_ok": commercial_ok,
        }
        for r in ranked[:n]
    ]


def select_clips_two_pass(recordings: list[dict], species_name: str) -> dict:
    """Two-pass clip selection: commercial first, NC fallback if needed.

    Filters background species, applies quality filter, then:
      Pass 1: commercial licenses only
      Pass 2: if <3 songs or <2 calls, relax to all CC licenses

    Returns dict with songs, calls, nc_fallback flag, and nc_clip_count.
    """
    # Filter background species
    clean = filter_background_species(recordings)
    bg_excluded = len(recordings) - len(clean)
    if bg_excluded:
        print(f"  [Xeno-canto] Excluded {bg_excluded} recordings with background species")

    # Quality filter
    quality = [r for r in clean if r.get("q") in ("A", "B")]
    if len(quality) < 3:
        quality = [r for r in clean if r.get("q") in ("A", "B", "C")]

    # Pass 1: commercial only
    commercial = [r for r in quality if is_commercial_license(r.get("lic", ""))]
    songs = select_xc_clips(commercial, "song", 3, commercial_ok=True)
    # Exclude song picks from call selection so compound types ('call, song') don't duplicate
    song_ids = {s["xc_id"] for s in songs}
    calls = select_xc_clips(commercial, "call", 2, commercial_ok=True, exclude_ids=song_ids)

    nc_fallback = False
    nc_clip_count = 0

    # Pass 2: relax to all CC if needed
    need_more_songs = len(songs) < 3
    need_more_calls = len(calls) < 2
    if need_more_songs or need_more_calls:
        nc_fallback = True
        all_cc = [r for r in quality if is_any_cc_license(r.get("lic", ""))]

        if need_more_songs:
            # Get existing commercial song IDs to avoid duplicates
            existing_ids = {s["xc_id"] for s in songs}
            nc_songs = select_xc_clips(all_cc, "song", 3, commercial_ok=False)
            nc_songs = [s for s in nc_songs if s["xc_id"] not in existing_ids]
            needed = 3 - len(songs)
            for s in nc_songs[:needed]:
                s["commercial_ok"] = False
                songs.append(s)
            print(f"  ⚠ {species_name}: only {len([s for s in songs if s['commercial_ok']])} commercial song(s) found, relaxing to NC licenses")

        if need_more_calls:
            existing_ids = {c["xc_id"] for c in calls} | {s["xc_id"] for s in songs}
            nc_calls = select_xc_clips(all_cc, "call", 2, commercial_ok=False)
            nc_calls = [c for c in nc_calls if c["xc_id"] not in existing_ids]
            needed = 2 - len(calls)
            for c in nc_calls[:needed]:
                c["commercial_ok"] = False
                calls.append(c)
            print(f"  ⚠ {species_name}: only {len([c for c in calls if c['commercial_ok']])} commercial call(s) found, relaxing to NC licenses")

        nc_clip_count = sum(1 for c in songs + calls if not c["commercial_ok"])

    # Fallback: use top recordings regardless of type if no songs at all
    if not songs:
        all_cc = [r for r in quality if is_any_cc_license(r.get("lic", ""))]
        fallback = sorted(all_cc, key=score_recording, reverse=True)[:3]
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
                "commercial_ok": is_commercial_license(r.get("lic", "")),
            }
            for r in fallback
        ]
        if songs:
            print(f"  [Xeno-canto] ⚠ No typed songs — used top {len(songs)} untyped")

    return {
        "songs": songs,
        "calls": calls,
        "nc_fallback": nc_fallback,
        "nc_clip_count": nc_clip_count,
    }


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

    # Filter to any CC license first (ND excluded)
    recs = [r for r in recs if is_any_cc_license(r.get("lic", ""))]
    print(f"  [Xeno-canto] After license filter: {len(recs)}")

    result = select_clips_two_pass(recs, name)
    songs = result["songs"]
    calls = result["calls"]

    sp["audio_clips"] = {"songs": songs, "calls": calls}
    print(f"  [Xeno-canto] ✓ Selected {len(songs)} songs, {len(calls)} calls")

    if not songs and not calls:
        print(f"  ✗ NO AUDIO FOUND — manual curation needed for this species")

    return result


def format_summary_report(species_results: list[dict]) -> str:
    """Format a summary report of the pipeline run.

    Each entry in species_results has:
      name, songs, calls, commercial_clips, nc_clips, nc_fallback
    """
    lines = []
    lines.append(f"\n{'═'*60}")
    lines.append("  PIPELINE SUMMARY")
    lines.append(f"{'═'*60}")

    # NC fallback species
    nc_species = [s for s in species_results if s["nc_fallback"]]
    if nc_species:
        lines.append("\n  NC License Fallbacks:")
        for s in nc_species:
            lines.append(f"    - {s['name']}: {s['nc_clips']} NC clip(s)")
    else:
        lines.append("\n  No species required NC fallback")

    # Under-target species (< 3 songs or < 2 calls)
    under = [s for s in species_results if s["songs"] < 3 or s["calls"] < 2]
    if under:
        lines.append("\n  Under-Target Species:")
        for s in under:
            lines.append(f"    - {s['name']}: {s['songs']} songs (target 3), {s['calls']} calls (target 2)")
    else:
        lines.append("\n  All species met clip targets")

    # Totals
    total_commercial = sum(s["commercial_clips"] for s in species_results)
    total_nc = sum(s["nc_clips"] for s in species_results)
    total = total_commercial + total_nc
    if total > 0:
        pct = total_commercial * 100 // total
        lines.append(f"\n  Commercial: {total_commercial}/{total} clips ({pct}%), NC fallback: {total_nc}/{total} clips ({100-pct}%)")
    else:
        lines.append("\n  No clips selected")

    # Quality grade breakdown
    total_quality: dict[str, int] = {}
    for s in species_results:
        for grade, count in s.get("quality_counts", {}).items():
            total_quality[grade] = total_quality.get(grade, 0) + count
    if total_quality:
        grade_str = ", ".join(
            f"{g}: {total_quality[g]}"
            for g in sorted(total_quality, key=lambda g: (g not in "ABCDE", g))
        )
        lines.append(f"  Quality grades: {grade_str}")

    lines.append(f"{'═'*60}")
    return "\n".join(lines)


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
    print(f"  Audio source: Xeno-canto (prefer commercial CC; fallback NC)")
    print(f"  Region tiebreaker: Washington > PNW > California (small bonus only)")
    print("=" * 60)

    species_results = []
    for i, sp in enumerate(species, 1):
        print(f"\n[{i}/{len(species)}]", end="")
        result = process_species(sp)
        if result:
            songs = result["songs"]
            calls = result["calls"]
            all_clips = songs + calls
            commercial_clips = sum(1 for c in all_clips if c.get("commercial_ok"))
            nc_clips = sum(1 for c in all_clips if not c.get("commercial_ok"))
            quality_counts = {}
            for c in all_clips:
                q = c.get("quality") or "?"
                quality_counts[q] = quality_counts.get(q, 0) + 1
            species_results.append({
                "name": sp["common_name"],
                "songs": len(songs),
                "calls": len(calls),
                "commercial_clips": commercial_clips,
                "nc_clips": nc_clips,
                "nc_fallback": result["nc_fallback"],
                "quality_counts": quality_counts,
            })
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

    # Pipeline summary report
    print(format_summary_report(species_results))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build BeakSpeak audio assets from a small, manual Xeno-canto selection file."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import tomllib
from array import array
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import requests


SELECTION_SCHEMA_VERSION = 1
LOCK_SCHEMA_VERSION = 1
ACTIVE_WINDOW_SECONDS = 10.0
ACTIVE_WINDOW_ALGORITHM = "sustained-energy-v1"
ENCODER_VERSION = "opus-96k-atrim-loudnorm-v2"
ANALYSIS_SAMPLE_RATE = 8_000
ANALYSIS_FRAME_SECONDS = 0.05
SUPPORTED_ROLE_KEYS = {"songs": "song", "calls": "call"}

DEFAULT_SELECTIONS = Path("content/audio-selections.toml")
DEFAULT_BASE_MANIFEST = Path("content/manifest-base.json")
DEFAULT_LOCK = Path("content/audio-metadata.lock.json")
DEFAULT_MANIFEST_OUT = Path("beakspeak/public/content/manifest.json")
DEFAULT_AUDIO_DIR = Path("beakspeak/public/content/audio/manual")
DEFAULT_CACHE_DIR = Path(".cache/manual-audio/sources")

Runner = Callable[..., subprocess.CompletedProcess]


class ManualAudioError(RuntimeError):
    """Raised when manual audio input or generated content is invalid."""


@dataclass(frozen=True)
class Selection:
    species_id: str
    role: str
    xc_id: str
    start_s: float | None = None
    end_s: float | None = None
    note: str | None = None

    @property
    def key(self) -> str:
        return f"{self.species_id}:{self.role}:xc{self.xc_id}"

    @property
    def has_manual_trim(self) -> bool:
        return self.start_s is not None and self.end_s is not None

    def audio_input(self) -> dict[str, Any]:
        return {
            "species_id": self.species_id,
            "role": self.role,
            "xc_id": self.xc_id,
            "start_s": self.start_s,
            "end_s": self.end_s,
        }


@dataclass(frozen=True)
class SelectionFile:
    curator: str | None
    selections: tuple[Selection, ...]


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _hash_json(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_xc_id(value: object) -> str:
    if isinstance(value, bool):
        raise ManualAudioError("Xeno-canto IDs must be numbers such as 355086 or strings such as XC355086")
    raw = str(value).strip()
    if raw.lower().startswith("xc"):
        raw = raw[2:]
    if not raw.isdigit() or int(raw) <= 0:
        raise ManualAudioError(f"Invalid Xeno-canto ID: {value!r}")
    return str(int(raw))


def _optional_float(entry: dict[str, Any], field: str, context: str) -> float | None:
    value = entry.get(field)
    if value is None:
        return None
    if isinstance(value, bool):
        raise ManualAudioError(f"{context} {field} must be a number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ManualAudioError(f"{context} {field} must be a number") from exc
    if not math.isfinite(result):
        raise ManualAudioError(f"{context} {field} must be finite")
    return result


def load_base_manifest(path: str | Path = DEFAULT_BASE_MANIFEST) -> dict[str, Any]:
    path = Path(path)
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise ManualAudioError(f"Base manifest not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ManualAudioError(f"Base manifest is invalid JSON: {path}: {exc}") from exc

    species = data.get("species")
    if not isinstance(species, list) or not species:
        raise ManualAudioError("Base manifest must contain a non-empty species array")
    seen: set[str] = set()
    for item in species:
        species_id = str(item.get("id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_-]+", species_id) or species_id in seen:
            raise ManualAudioError(f"Base manifest has a missing or duplicate species ID: {species_id!r}")
        seen.add(species_id)
        item["audio_clips"] = {"songs": [], "calls": []}
    return data


def load_selections(
    path: str | Path = DEFAULT_SELECTIONS,
    *,
    base_manifest: dict[str, Any] | None = None,
) -> SelectionFile:
    path = Path(path)
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except FileNotFoundError as exc:
        raise ManualAudioError(f"Manual audio selections not found: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ManualAudioError(f"Manual audio selections are invalid TOML: {path}: {exc}") from exc

    if data.get("version") != SELECTION_SCHEMA_VERSION:
        raise ManualAudioError(
            f"audio selections version must be {SELECTION_SCHEMA_VERSION}, got {data.get('version')!r}"
        )
    curator = data.get("curator")
    if curator is not None and not isinstance(curator, str):
        raise ManualAudioError("curator must be a string when provided")

    configured_species = data.get("species")
    if not isinstance(configured_species, dict):
        raise ManualAudioError("audio selections must contain [species.<id>] entries")

    base_species = {
        str(item["id"]): item
        for item in (base_manifest or {}).get("species", [])
    }
    if base_species:
        unknown = sorted(set(configured_species) - set(base_species))
        missing = sorted(set(base_species) - set(configured_species))
        if unknown:
            raise ManualAudioError(f"Selections contain unknown species: {', '.join(unknown)}")
        if missing:
            raise ManualAudioError(f"Selections are missing species: {', '.join(missing)}")

    selections: list[Selection] = []
    used_xc_ids: dict[str, str] = {}
    species_order = list(base_species) if base_species else list(configured_species)
    for species_id in species_order:
        role_data = configured_species.get(species_id)
        if not isinstance(role_data, dict):
            raise ManualAudioError(f"species.{species_id} must be a TOML table")
        extra_roles = sorted(set(role_data) - set(SUPPORTED_ROLE_KEYS))
        if extra_roles:
            raise ManualAudioError(
                f"species.{species_id} has unsupported fields: {', '.join(extra_roles)}"
            )
        for plural_role, role in SUPPORTED_ROLE_KEYS.items():
            entries = role_data.get(plural_role)
            if not isinstance(entries, list) or not entries:
                raise ManualAudioError(f"species.{species_id}.{plural_role} must contain at least one recording")
            for index, entry in enumerate(entries):
                context = f"species.{species_id}.{plural_role}[{index}]"
                if not isinstance(entry, dict):
                    raise ManualAudioError(f"{context} must be a table")
                unknown_fields = sorted(set(entry) - {"xc", "start_s", "end_s", "note"})
                if unknown_fields:
                    raise ManualAudioError(f"{context} has unsupported fields: {', '.join(unknown_fields)}")
                if "xc" not in entry:
                    raise ManualAudioError(f"{context} must specify xc")
                xc_id = _normalize_xc_id(entry["xc"])
                previous = used_xc_ids.get(xc_id)
                if previous:
                    raise ManualAudioError(f"XC{xc_id} is selected more than once ({previous} and {context})")
                used_xc_ids[xc_id] = context

                start_s = _optional_float(entry, "start_s", context)
                end_s = _optional_float(entry, "end_s", context)
                if (start_s is None) != (end_s is None):
                    raise ManualAudioError(f"{context} must provide both start_s and end_s, or neither")
                if start_s is not None and (start_s < 0 or end_s is None or end_s <= start_s):
                    raise ManualAudioError(f"{context} trim must satisfy 0 <= start_s < end_s")
                note = entry.get("note")
                if note is not None and not isinstance(note, str):
                    raise ManualAudioError(f"{context} note must be a string")
                selections.append(Selection(species_id, role, xc_id, start_s, end_s, note))

    return SelectionFile(curator=curator, selections=tuple(selections))


def selection_digest(selection_file: SelectionFile) -> str:
    return _hash_json({
        "version": SELECTION_SCHEMA_VERSION,
        "curator": selection_file.curator,
        "selections": [
            {**selection.audio_input(), "note": selection.note}
            for selection in selection_file.selections
        ],
    })


def _is_supported_license(url: str) -> bool:
    lowered = url.lower().rstrip("/")
    if "creativecommons.org/publicdomain/zero" in lowered:
        return True
    supported = ("/by/", "/by-sa/", "/by-nc/", "/by-nc-sa/")
    return "creativecommons.org/licenses/" in lowered and any(marker in f"{lowered}/" for marker in supported)


def _is_commercial_license(url: str) -> bool:
    lowered = url.lower()
    return _is_supported_license(url) and "-nc" not in lowered and "/by-nc" not in lowered


def _normalize_source_url(value: object) -> str:
    url = str(value or "").strip()
    if url.startswith("//"):
        url = "https:" + url
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").casefold()
    if parsed.scheme != "https" or not (hostname == "xeno-canto.org" or hostname.endswith(".xeno-canto.org")):
        raise ManualAudioError(f"Xeno-canto metadata returned an unsupported source URL: {url or 'none'}")
    return url


def project_xc_recording(recording: dict[str, Any], expected_xc_id: str) -> dict[str, Any]:
    xc_id = _normalize_xc_id(recording.get("id", ""))
    if xc_id != expected_xc_id:
        raise ManualAudioError(f"Expected XC{expected_xc_id}, received metadata for XC{xc_id}")

    scientific_name = str(recording.get("sci-name") or "").strip()
    if not scientific_name:
        genus = str(recording.get("gen") or "").strip()
        species = str(recording.get("sp") or "").strip()
        scientific_name = " ".join(part for part in (genus, species) if part)

    license_url = str(recording.get("lic") or recording.get("license") or "").strip()
    source_url = _normalize_source_url(recording.get("file") or recording.get("source_url"))
    if not source_url:
        raise ManualAudioError(f"XC{xc_id} metadata does not contain a downloadable audio URL")
    if not _is_supported_license(license_url):
        raise ManualAudioError(f"XC{xc_id} has a missing or unsupported license: {license_url or 'none'}")

    return {
        "xc_id": xc_id,
        "xc_url": f"https://xeno-canto.org/{xc_id}",
        "source_url": source_url,
        "scientific_name": scientific_name,
        "common_name": str(recording.get("en") or recording.get("common_name") or "").strip(),
        "type": str(recording.get("type") or "").strip(),
        "quality": str(recording.get("q") or recording.get("quality") or "").strip(),
        "length": str(recording.get("length") or "").strip(),
        "recordist": str(recording.get("rec") or recording.get("recordist") or "").strip(),
        "license": license_url,
        "location": str(recording.get("loc") or recording.get("location") or "").strip(),
        "country": str(recording.get("cnt") or recording.get("country") or "").strip(),
        "commercial_ok": _is_commercial_license(license_url),
    }


def fetch_xc_recording(
    xc_id: str,
    *,
    api_key: str,
    session: Any = requests,
) -> dict[str, Any]:
    if not api_key:
        raise ManualAudioError(
            f"XC_API_KEY is required to resolve new or refreshed recordings (needed for XC{xc_id})"
        )
    response = None
    try:
        response = session.get(
            "https://xeno-canto.org/api/3/recordings",
            params={"query": f"nr:{xc_id}", "per_page": 10, "key": api_key},
            headers={"User-Agent": "BeakSpeak/1.0 manual audio sync"},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        detail = f"HTTP {status}" if status is not None else "network request failed"
        raise ManualAudioError(f"Failed to resolve XC{xc_id}: {detail}") from exc
    except ValueError as exc:
        raise ManualAudioError(f"Failed to resolve XC{xc_id}: invalid JSON response") from exc
    finally:
        if response is not None:
            close = getattr(response, "close", None)
            if close is not None:
                close()

    if not isinstance(payload, dict) or not isinstance(payload.get("recordings"), list):
        raise ManualAudioError(f"Failed to resolve XC{xc_id}: response has no recordings array")

    matches = [
        item for item in payload.get("recordings", [])
        if str(item.get("id", "")) == xc_id
    ]
    if len(matches) != 1:
        raise ManualAudioError(f"Xeno-canto lookup for XC{xc_id} returned {len(matches)} exact matches")
    return project_xc_recording(matches[0], xc_id)


def _species_binomial(value: str) -> str:
    return " ".join(value.casefold().split()[:2])


def validate_recording_species(selection: Selection, metadata: dict[str, Any], species: dict[str, Any]) -> None:
    expected = _species_binomial(str(species.get("scientific_name", "")))
    actual = _species_binomial(str(metadata.get("scientific_name", "")))
    if not actual:
        raise ManualAudioError(f"XC{selection.xc_id} metadata is missing its scientific name")
    if actual != expected:
        raise ManualAudioError(
            f"{selection.species_id} {selection.role} selects XC{selection.xc_id}, which is {metadata['scientific_name']}; "
            f"expected {species.get('scientific_name')}"
        )


def load_lock(path: str | Path = DEFAULT_LOCK, *, required: bool = False) -> dict[str, Any]:
    path = Path(path)
    if not path.exists():
        if required:
            raise ManualAudioError(f"Manual audio metadata lock not found: {path}; run the audio sync first")
        return {
            "schema_version": LOCK_SCHEMA_VERSION,
            "algorithm_version": ACTIVE_WINDOW_ALGORITHM,
            "encoder_version": ENCODER_VERSION,
            "recordings": {},
            "outputs": {},
        }
    try:
        lock = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ManualAudioError(f"Manual audio metadata lock is invalid JSON: {path}: {exc}") from exc
    if lock.get("schema_version") != LOCK_SCHEMA_VERSION:
        raise ManualAudioError(
            f"Manual audio metadata lock version must be {LOCK_SCHEMA_VERSION}, got {lock.get('schema_version')!r}"
        )
    lock.setdefault("recordings", {})
    lock.setdefault("outputs", {})
    return lock


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            temp_path = Path(handle.name)
            json.dump(value, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        temp_path.replace(path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def _download_source(
    metadata: dict[str, Any],
    destination: Path,
    *,
    session: Any = requests,
    attempts: int = 3,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        temp_path: Path | None = None
        response = None
        try:
            with tempfile.NamedTemporaryFile("wb", dir=destination.parent, delete=False) as handle:
                temp_path = Path(handle.name)
                response = session.get(
                    metadata["source_url"],
                    headers={"User-Agent": "BeakSpeak/1.0 manual audio sync"},
                    timeout=60,
                    stream=True,
                )
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        handle.write(chunk)
            if temp_path.stat().st_size == 0:
                raise ManualAudioError(f"Downloaded XC{metadata['xc_id']} source is empty")
            temp_path.replace(destination)
            return
        except (requests.RequestException, OSError, ManualAudioError) as exc:
            last_error = exc
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
            if attempt == attempts:
                break
        finally:
            if response is not None:
                close = getattr(response, "close", None)
                if close is not None:
                    close()
    raise ManualAudioError(f"Failed to download XC{metadata['xc_id']} after {attempts} attempts: {last_error}")


def probe_duration(path: str | Path, *, runner: Runner = subprocess.run) -> float:
    command = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ]
    result = runner(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise ManualAudioError(f"ffprobe failed for {path}: {(result.stderr or '').strip()}")
    try:
        duration = float((result.stdout or "").strip())
    except ValueError as exc:
        raise ManualAudioError(f"ffprobe returned an invalid duration for {path}: {result.stdout!r}") from exc
    if not math.isfinite(duration) or duration <= 0:
        raise ManualAudioError(f"Audio duration must be positive for {path}, got {duration}")
    return duration


def _frame_levels(samples: array, frame_samples: int) -> list[float]:
    levels: list[float] = []
    for offset in range(0, len(samples), frame_samples):
        frame = samples[offset:offset + frame_samples]
        if not frame:
            continue
        mean_square = sum(float(sample) * float(sample) for sample in frame) / len(frame)
        rms = math.sqrt(mean_square) / 32768.0
        levels.append(20.0 * math.log10(max(rms, 1e-8)))
    return levels


def choose_active_window(
    source: str | Path,
    duration_s: float,
    *,
    runner: Runner = subprocess.run,
) -> dict[str, Any]:
    if duration_s <= ACTIVE_WINDOW_SECONDS:
        return {
            "mode": "full",
            "start_s": 0.0,
            "end_s": round(duration_s, 3),
            "activity_pct": None,
            "warning": None,
        }

    frame_samples = round(ANALYSIS_SAMPLE_RATE * ANALYSIS_FRAME_SECONDS)
    command = [
        "ffmpeg", "-v", "error", "-i", str(source),
        "-ac", "1", "-ar", str(ANALYSIS_SAMPLE_RATE),
        "-af", "highpass=f=200", "-f", "s16le", "-",
    ]
    result = runner(command, capture_output=True)
    if result.returncode != 0:
        stderr = result.stderr.decode(errors="replace") if isinstance(result.stderr, bytes) else str(result.stderr or "")
        raise ManualAudioError(f"FFmpeg activity analysis failed for {source}: {stderr.strip()}")

    samples = array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    levels = _frame_levels(samples, frame_samples)
    window_frames = max(1, round(ACTIVE_WINDOW_SECONDS / ANALYSIS_FRAME_SECONDS))
    if len(levels) <= window_frames:
        return {
            "mode": "full",
            "start_s": 0.0,
            "end_s": round(duration_s, 3),
            "activity_pct": None,
            "warning": None,
        }

    # Saturating the per-frame contribution makes sustained sound beat one loud transient.
    strengths = [max(0.0, min(1.0, (level + 60.0) / 35.0)) for level in levels]
    prefix = [0.0]
    for strength in strengths:
        prefix.append(prefix[-1] + strength)

    edge_frames = max(1, round(0.25 / ANALYSIS_FRAME_SECONDS))
    best_index = 0
    best_score = float("-inf")
    for start in range(0, len(strengths) - window_frames + 1):
        end = start + window_frames
        total = prefix[end] - prefix[start]
        edge_total = (prefix[start + edge_frames] - prefix[start]) + (prefix[end] - prefix[end - edge_frames])
        score = total - 0.35 * edge_total
        if score > best_score:
            best_score = score
            best_index = start

    start_s = best_index * ANALYSIS_FRAME_SECONDS
    start_s = min(start_s, max(0.0, duration_s - ACTIVE_WINDOW_SECONDS))
    end_s = min(duration_s, start_s + ACTIVE_WINDOW_SECONDS)
    chosen_levels = levels[best_index:best_index + window_frames]
    active_pct = round(100.0 * sum(level > -45.0 for level in chosen_levels) / len(chosen_levels), 1)
    warning = None
    if active_pct < 20.0:
        warning = f"strongest window has only {active_pct:.1f}% active sound above -45 dBFS"
    return {
        "mode": "automatic",
        "start_s": round(start_s, 3),
        "end_s": round(end_s, 3),
        "activity_pct": active_pct,
        "warning": warning,
    }


def encode_audio(
    source: str | Path,
    destination: str | Path,
    *,
    start_s: float,
    end_s: float,
    runner: Runner = subprocess.run,
) -> None:
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    duration = end_s - start_s
    fade_duration = min(0.03, duration / 4)
    fade_out_start = max(0.0, duration - fade_duration)
    filters = (
        f"atrim=start={start_s:.3f}:end={end_s:.3f},"
        "asetpts=PTS-STARTPTS,"
        "loudnorm=I=-16:TP=-1.5:LRA=11,"
        f"afade=t=in:st=0:d={fade_duration:.3f},"
        f"afade=t=out:st={fade_out_start:.3f}:d={fade_duration:.3f}"
    )
    command = [
        "ffmpeg", "-v", "error", "-i", str(source),
        "-af", filters, "-c:a", "libopus", "-b:a", "96k", "-y", str(destination),
    ]
    result = runner(command, capture_output=True, text=True)
    if result.returncode != 0:
        destination.unlink(missing_ok=True)
        raise ManualAudioError(f"FFmpeg encoding failed for {source}: {(result.stderr or '').strip()}")


def _selection_fingerprint(selection: Selection) -> str:
    return _hash_json(selection.audio_input())


def _output_filename(selection: Selection) -> str:
    return f"{selection.species_id}/{selection.role}-xc{selection.xc_id}.ogg"


def _safe_output_path(audio_dir: Path, filename: str) -> Path:
    root = audio_dir.resolve()
    candidate = (audio_dir / filename).resolve()
    if not candidate.is_relative_to(root):
        raise ManualAudioError(f"Generated audio filename escapes its owned directory: {filename!r}")
    return candidate


def _clip_from_metadata(metadata: dict[str, Any], audio_url: str) -> dict[str, Any]:
    return {
        "xc_id": metadata["xc_id"],
        "xc_url": metadata["xc_url"],
        "audio_url": audio_url,
        "type": metadata["type"],
        "quality": metadata["quality"],
        "length": metadata["length"],
        "recordist": metadata["recordist"],
        "license": metadata["license"],
        "location": metadata["location"],
        "country": metadata["country"],
        "score": 0,
        "commercial_ok": metadata["commercial_ok"],
    }


def build_manifest(
    base_manifest: dict[str, Any],
    selection_file: SelectionFile,
    recordings: dict[str, dict[str, Any]],
    outputs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    manifest = deepcopy(base_manifest)
    species_by_id = {str(item["id"]): item for item in manifest["species"]}
    for item in manifest["species"]:
        item["audio_clips"] = {"songs": [], "calls": []}

    for selection in selection_file.selections:
        metadata = recordings.get(selection.xc_id)
        output = outputs.get(selection.key)
        if metadata is None or output is None:
            raise ManualAudioError(f"Lock is missing metadata or output state for {selection.key}")
        plural_role = f"{selection.role}s"
        species_by_id[selection.species_id]["audio_clips"][plural_role].append(
            _clip_from_metadata(metadata, output["audio_url"])
        )

    manifest["audio_build"] = {
        "mode": "manual",
        "selection_digest": selection_digest(selection_file),
        "algorithm_version": ACTIVE_WINDOW_ALGORITHM,
        "encoder_version": ENCODER_VERSION,
    }
    return manifest


def _resolve_metadata(
    selection_file: SelectionFile,
    base_manifest: dict[str, Any],
    existing_lock: dict[str, Any],
    *,
    refresh_metadata: bool,
    api_key: str,
    session: Any,
) -> tuple[dict[str, dict[str, Any]], list[str], set[str]]:
    existing_recordings = existing_lock.get("recordings", {})
    species_by_id = {str(item["id"]): item for item in base_manifest["species"]}
    recordings: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    changed_sources: set[str] = set()
    for selection in selection_file.selections:
        old_metadata = existing_recordings.get(selection.xc_id)
        if old_metadata is not None and not refresh_metadata:
            metadata = deepcopy(old_metadata)
        else:
            metadata = fetch_xc_recording(selection.xc_id, api_key=api_key, session=session)
            if old_metadata and old_metadata.get("source_url") != metadata.get("source_url"):
                changed_sources.add(selection.xc_id)
            elif old_metadata:
                for field in ("source_sha256", "source_duration_s"):
                    if field in old_metadata:
                        metadata[field] = old_metadata[field]
        validate_recording_species(selection, metadata, species_by_id[selection.species_id])
        if not metadata.get("commercial_ok"):
            warnings.append(f"{selection.key} uses non-commercial license {metadata['license']}")
        recordings[selection.xc_id] = metadata
    return recordings, warnings, changed_sources


def _source_path(cache_dir: Path, xc_id: str) -> Path:
    return cache_dir / f"xc{xc_id}.source"


def _ensure_source(
    metadata: dict[str, Any],
    cache_dir: Path,
    old_metadata: dict[str, Any] | None,
    *,
    source_changed: bool,
    session: Any,
    runner: Runner,
) -> tuple[Path, str, float]:
    source = _source_path(cache_dir, metadata["xc_id"])
    expected_hash = str((old_metadata or {}).get("source_sha256") or "")
    if source.exists() and source_changed:
        source.unlink()
    if source.exists() and expected_hash and _hash_file(source) != expected_hash:
        source.unlink()
    if not source.exists():
        _download_source(metadata, source, session=session)
    source_hash = _hash_file(source)
    duration = probe_duration(source, runner=runner)
    return source, source_hash, duration


def _output_is_reusable(
    selection: Selection,
    output: dict[str, Any] | None,
    audio_dir: Path,
    metadata: dict[str, Any],
    old_metadata: dict[str, Any] | None,
    *,
    force: bool,
) -> bool:
    if force or output is None:
        return False
    if output.get("selection_fingerprint") != _selection_fingerprint(selection):
        return False
    if output.get("algorithm_version") != ACTIVE_WINDOW_ALGORITHM:
        return False
    if output.get("encoder_version") != ENCODER_VERSION:
        return False
    if old_metadata and old_metadata.get("source_url") != metadata.get("source_url"):
        return False
    destination = _safe_output_path(audio_dir, str(output.get("filename", "")))
    expected_hash = str(output.get("output_sha256") or "")
    return destination.is_file() and bool(expected_hash) and _hash_file(destination) == expected_hash


def sync_manual_audio(
    *,
    selections_path: str | Path = DEFAULT_SELECTIONS,
    base_manifest_path: str | Path = DEFAULT_BASE_MANIFEST,
    lock_path: str | Path = DEFAULT_LOCK,
    manifest_out: str | Path = DEFAULT_MANIFEST_OUT,
    audio_dir: str | Path = DEFAULT_AUDIO_DIR,
    cache_dir: str | Path = DEFAULT_CACHE_DIR,
    refresh_metadata: bool = False,
    refresh_windows: bool = False,
    force: bool = False,
    api_key: str | None = None,
    session: Any = requests,
    runner: Runner = subprocess.run,
) -> dict[str, Any]:
    base_manifest_path = Path(base_manifest_path)
    lock_path = Path(lock_path)
    manifest_out = Path(manifest_out)
    audio_dir = Path(audio_dir)
    cache_dir = Path(cache_dir)
    base_manifest = load_base_manifest(base_manifest_path)
    selection_file = load_selections(selections_path, base_manifest=base_manifest)
    old_lock = load_lock(lock_path)
    old_recordings = old_lock.get("recordings", {})
    old_outputs = old_lock.get("outputs", {})

    recordings, warnings, changed_sources = _resolve_metadata(
        selection_file,
        base_manifest,
        old_lock,
        refresh_metadata=refresh_metadata,
        api_key=api_key if api_key is not None else os.environ.get("XC_API_KEY", ""),
        session=session,
    )

    audio_dir.mkdir(parents=True, exist_ok=True)
    generated_keys: list[str] = []
    reused_keys: list[str] = []
    next_outputs: dict[str, dict[str, Any]] = {}
    next_recordings = deepcopy(recordings)
    expected_files: set[Path] = set()

    with tempfile.TemporaryDirectory(prefix="manual-audio-stage-", dir=audio_dir.parent) as staging_root_raw:
        staging_root = Path(staging_root_raw)
        staged: list[tuple[Path, Path, str]] = []
        for selection in selection_file.selections:
            metadata = recordings[selection.xc_id]
            old_metadata = old_recordings.get(selection.xc_id)
            old_output = old_outputs.get(selection.key)
            filename = _output_filename(selection)
            destination = _safe_output_path(audio_dir, filename)
            expected_files.add(destination.resolve())

            if _output_is_reusable(
                selection,
                old_output,
                audio_dir,
                metadata,
                old_metadata,
                force=force or (refresh_windows and not selection.has_manual_trim),
            ):
                next_outputs[selection.key] = deepcopy(old_output)
                reused_keys.append(selection.key)
                continue

            source, source_hash, source_duration = _ensure_source(
                metadata,
                cache_dir,
                old_metadata,
                source_changed=selection.xc_id in changed_sources,
                session=session,
                runner=runner,
            )
            next_recordings[selection.xc_id]["source_sha256"] = source_hash
            next_recordings[selection.xc_id]["source_duration_s"] = round(source_duration, 3)

            if selection.has_manual_trim:
                assert selection.start_s is not None and selection.end_s is not None
                resolved = {
                    "mode": "manual",
                    "start_s": selection.start_s,
                    "end_s": selection.end_s,
                    "activity_pct": None,
                    "warning": None,
                }
                if selection.end_s > source_duration + 0.05:
                    raise ManualAudioError(
                        f"{selection.key} trim ends at {selection.end_s:.3f}s, beyond source duration {source_duration:.3f}s"
                    )
                if selection.end_s - selection.start_s > ACTIVE_WINDOW_SECONDS:
                    warnings.append(
                        f"{selection.key} manual trim is {selection.end_s - selection.start_s:.1f}s, longer than the 10s automatic target"
                    )
            else:
                cached_resolution = old_output.get("trim") if isinstance(old_output, dict) else None
                can_reuse_resolution = (
                    isinstance(cached_resolution, dict)
                    and not refresh_windows
                    and old_output.get("selection_fingerprint") == _selection_fingerprint(selection)
                    and old_output.get("algorithm_version") == ACTIVE_WINDOW_ALGORITHM
                    and selection.xc_id not in changed_sources
                )
                resolved = deepcopy(cached_resolution) if can_reuse_resolution else choose_active_window(
                    source, source_duration, runner=runner
                )
                if resolved.get("warning"):
                    warnings.append(f"{selection.key}: {resolved['warning']}")

            staged_destination = staging_root / filename
            encode_audio(
                source,
                staged_destination,
                start_s=float(resolved["start_s"]),
                end_s=float(resolved["end_s"]),
                runner=runner,
            )
            output_hash = _hash_file(staged_destination)
            audio_url = f"/content/audio/manual/{filename}"
            next_outputs[selection.key] = {
                "species_id": selection.species_id,
                "role": selection.role,
                "xc_id": selection.xc_id,
                "filename": filename,
                "audio_url": audio_url,
                "trim": resolved,
                "selection_fingerprint": _selection_fingerprint(selection),
                "source_sha256": source_hash,
                "output_sha256": output_hash,
                "algorithm_version": ACTIVE_WINDOW_ALGORITHM,
                "encoder_version": ENCODER_VERSION,
            }
            staged.append((staged_destination, destination, selection.key))

        # Promote only after every recording has resolved and encoded successfully.
        for staged_source, destination, key in staged:
            destination.parent.mkdir(parents=True, exist_ok=True)
            staged_source.replace(destination)
            generated_keys.append(key)

    manifest = build_manifest(base_manifest, selection_file, next_recordings, next_outputs)
    next_lock = {
        "schema_version": LOCK_SCHEMA_VERSION,
        "algorithm_version": ACTIVE_WINDOW_ALGORITHM,
        "encoder_version": ENCODER_VERSION,
        "selection_digest": selection_digest(selection_file),
        "base_manifest_digest": _hash_json(base_manifest),
        "recordings": next_recordings,
        "outputs": next_outputs,
    }
    _write_json_atomic(manifest_out, manifest)
    _write_json_atomic(lock_path, next_lock)

    pruned: list[str] = []
    for old_output in old_outputs.values():
        old_path = _safe_output_path(audio_dir, str(old_output.get("filename", "")))
        if old_path not in expected_files and old_path.is_file():
            old_path.unlink()
            pruned.append(str(old_path))

    return {
        "manifest": manifest,
        "lock": next_lock,
        "generated": generated_keys,
        "reused": reused_keys,
        "pruned": pruned,
        "warnings": warnings,
    }


def check_manual_audio(
    *,
    selections_path: str | Path = DEFAULT_SELECTIONS,
    base_manifest_path: str | Path = DEFAULT_BASE_MANIFEST,
    lock_path: str | Path = DEFAULT_LOCK,
    manifest_path: str | Path = DEFAULT_MANIFEST_OUT,
    audio_dir: str | Path = DEFAULT_AUDIO_DIR,
) -> list[str]:
    errors: list[str] = []
    try:
        base_manifest = load_base_manifest(base_manifest_path)
        selection_file = load_selections(selections_path, base_manifest=base_manifest)
        lock = load_lock(lock_path, required=True)
    except ManualAudioError as exc:
        return [str(exc)]

    if lock.get("algorithm_version") != ACTIVE_WINDOW_ALGORITHM:
        errors.append("Automatic-window algorithm changed; run the manual audio sync")
    if lock.get("encoder_version") != ENCODER_VERSION:
        errors.append("Audio encoder settings changed; run the manual audio sync")
    if lock.get("selection_digest") != selection_digest(selection_file):
        errors.append("Manual audio selections changed; run the manual audio sync")
    if lock.get("base_manifest_digest") != _hash_json(base_manifest):
        errors.append("Base manifest changed; run the manual audio sync")

    outputs = lock.get("outputs", {})
    expected_keys = {selection.key for selection in selection_file.selections}
    actual_keys = set(outputs)
    for missing in sorted(expected_keys - actual_keys):
        errors.append(f"Metadata lock is missing output {missing}")
    for stale in sorted(actual_keys - expected_keys):
        errors.append(f"Metadata lock contains stale output {stale}")

    audio_dir = Path(audio_dir)
    for key in sorted(expected_keys & actual_keys):
        output = outputs[key]
        try:
            path = _safe_output_path(audio_dir, str(output.get("filename", "")))
        except ManualAudioError as exc:
            errors.append(f"Invalid generated audio path for {key}: {exc}")
            continue
        if not path.is_file():
            errors.append(f"Generated audio is missing for {key}: {path}")
            continue
        expected_hash = str(output.get("output_sha256") or "")
        if not expected_hash or _hash_file(path) != expected_hash:
            errors.append(f"Generated audio is stale or modified for {key}: {path}")

    manifest_path = Path(manifest_path)
    if not manifest_path.is_file():
        errors.append(f"Generated manifest is missing: {manifest_path}")
    else:
        try:
            actual_manifest = json.loads(manifest_path.read_text())
            expected_manifest = build_manifest(
                base_manifest,
                selection_file,
                lock.get("recordings", {}),
                outputs,
            )
            if _canonical_json(actual_manifest) != _canonical_json(expected_manifest):
                errors.append("Generated manifest is stale or does not match the manual audio lock")
        except (json.JSONDecodeError, ManualAudioError) as exc:
            errors.append(f"Generated manifest is invalid: {exc}")
    return errors


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selections", default=str(DEFAULT_SELECTIONS))
    parser.add_argument("--base-manifest", default=str(DEFAULT_BASE_MANIFEST))
    parser.add_argument("--lock-file", default=str(DEFAULT_LOCK))
    parser.add_argument("--manifest-out", default=str(DEFAULT_MANIFEST_OUT))
    parser.add_argument("--audio-dir", default=str(DEFAULT_AUDIO_DIR))
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR))
    parser.add_argument("--refresh-metadata", action="store_true")
    parser.add_argument(
        "--refresh-windows",
        action="store_true",
        help="Recalculate automatic windows while preserving explicit manual trims",
    )
    parser.add_argument("--force", action="store_true", help="Regenerate every selected audio output")
    parser.add_argument("--check", action="store_true", help="Verify generated content without network access")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.check:
        errors = check_manual_audio(
            selections_path=args.selections,
            base_manifest_path=args.base_manifest,
            lock_path=args.lock_file,
            manifest_path=args.manifest_out,
            audio_dir=args.audio_dir,
        )
        if errors:
            for error in errors:
                print(f"Error: {error}", file=sys.stderr)
            return 1
        print("Manual audio content is current.")
        return 0

    try:
        result = sync_manual_audio(
            selections_path=args.selections,
            base_manifest_path=args.base_manifest,
            lock_path=args.lock_file,
            manifest_out=args.manifest_out,
            audio_dir=args.audio_dir,
            cache_dir=args.cache_dir,
            refresh_metadata=args.refresh_metadata,
            refresh_windows=args.refresh_windows,
            force=args.force,
        )
    except (ManualAudioError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    for key, output in result["lock"]["outputs"].items():
        trim = output["trim"]
        activity = "" if trim.get("activity_pct") is None else f", {trim['activity_pct']:.1f}% active"
        print(f"{key}: {trim['mode']} {trim['start_s']:.3f}s-{trim['end_s']:.3f}s{activity}")
    for warning in result["warnings"]:
        print(f"Warning: {warning}", file=sys.stderr)
    print(
        f"Manual audio sync complete: {len(result['generated'])} generated, "
        f"{len(result['reused'])} reused, {len(result['pruned'])} pruned."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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
import csv
import io
import shlex
import shutil
import subprocess
import tempfile
from copy import deepcopy
import requests
from pathlib import Path
from urllib.parse import quote

XC_API_KEY = os.environ.get("XC_API_KEY", "")
POOL_SCHEMA_VERSION = 2

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "BeakSpeakApp/0.1 (educational bird sound learning app; contact: mistercheese@gmail.com)"
})

PREFERRED_SEGMENT_DURATION_S = 7.0
MAX_FALLBACK_SEGMENT_DURATION_S = 12.0
TARGET_REGION_PADDING_S = 0.75
TARGET_REGION_GAP_S = 0.75


# ═══════════════════════════════════════════════════════════════════
# CURATED AUDIO POOL SCHEMA
# ═══════════════════════════════════════════════════════════════════

def parse_xc_types(type_value: str | list[str] | None) -> list[str]:
    """Normalize XC type metadata into a stable token list."""
    if isinstance(type_value, list):
        return [item.strip() for item in type_value if isinstance(item, str) and item.strip()]
    if not type_value:
        return []
    return [item.strip() for item in str(type_value).split(",") if item.strip()]


def normalize_analysis_payload(payload: dict | None) -> dict:
    """Ensure candidates always carry analysis-ready placeholder fields."""
    normalized = dict(payload or {})
    normalized.setdefault("status", "not_analyzed")
    normalized.setdefault("provider", None)
    normalized.setdefault("target_detections", [])
    normalized.setdefault("overlap_detections", [])
    normalized.setdefault("summary", None)
    normalized.setdefault("failure", None)
    return normalized


def normalize_segment_payload(payload: dict | None) -> dict:
    """Ensure candidates always carry persisted segment placeholder fields."""
    normalized = dict(payload or {})
    normalized.setdefault("status", "not_set")
    normalized.setdefault("start_s", None)
    normalized.setdefault("end_s", None)
    normalized.setdefault("duration_s", None)
    normalized.setdefault("confidence", None)
    normalized.setdefault("fallback_reason", None)
    return normalized


def _round_segment_value(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 3)


def _build_segment_payload(
    *,
    status: str,
    start_s: float,
    end_s: float,
    confidence: float | None,
    fallback_reason: str | None,
) -> dict:
    duration_s = max(0.0, float(end_s) - float(start_s))
    return normalize_segment_payload({
        "status": status,
        "start_s": _round_segment_value(start_s),
        "end_s": _round_segment_value(end_s),
        "duration_s": _round_segment_value(duration_s),
        "confidence": _round_segment_value(confidence),
        "fallback_reason": fallback_reason,
    })


def build_candidate_id(xc_id: str, source_role: str, occurrence_index: int) -> str:
    return f"xc:{xc_id}:{source_role}:{occurrence_index}"


def normalize_candidate_record(candidate: dict, source_role: str, occurrence_index: int) -> dict:
    """Normalize one candidate record into the unified persisted schema."""
    normalized = dict(candidate)
    xc_id = str(normalized.get("xc_id", "") or "")
    selected_role = normalized.get("selected_role")
    if selected_role not in {"song", "call", "none"}:
        selected_role = source_role if normalized.get("selected") else "none"

    raw_type = normalized.get("type", normalized.get("xc_type", ""))
    xc_types = parse_xc_types(normalized.get("xc_types", raw_type))

    normalized["xc_id"] = xc_id
    normalized["candidate_id"] = str(
        normalized.get("candidate_id")
        or build_candidate_id(xc_id, source_role, occurrence_index)
    )
    normalized["source_role"] = source_role
    normalized["selected_role"] = selected_role
    normalized["type"] = raw_type
    normalized["xc_type"] = raw_type
    normalized["xc_types"] = xc_types
    normalized["commercial_ok"] = bool(normalized.get("commercial_ok", False))
    normalized["analysis"] = normalize_analysis_payload(normalized.get("analysis"))
    normalized["segment"] = normalize_segment_payload(normalized.get("segment"))
    normalized.pop("selected", None)
    return normalized


def normalize_audio_clips(audio_clips: dict | None) -> dict:
    """Normalize old/new audio clip payloads into unified candidate records."""
    if not isinstance(audio_clips, dict):
        return {"schema_version": POOL_SCHEMA_VERSION, "candidates": []}

    preserved_fields = {
        key: deepcopy(value)
        for key, value in audio_clips.items()
        if key not in {"schema_version", "songs", "calls", "candidates"}
    }

    if "candidates" in audio_clips:
        source_counts: dict[str, int] = {"song": 0, "call": 0, "none": 0}
        candidates = []
        for candidate in audio_clips.get("candidates", []):
            source_role = candidate.get("source_role")
            if source_role not in {"song", "call"}:
                selected_role = candidate.get("selected_role")
                source_role = selected_role if selected_role in {"song", "call"} else "song"
            occurrence_index = source_counts.get(source_role, 0)
            source_counts[source_role] = occurrence_index + 1
            candidates.append(normalize_candidate_record(candidate, source_role, occurrence_index))
        return {
            **preserved_fields,
            "schema_version": POOL_SCHEMA_VERSION,
            "candidates": candidates,
        }

    candidates = []
    for source_role in ("song", "call"):
        for occurrence_index, candidate in enumerate(audio_clips.get(f"{source_role}s", [])):
            candidates.append(normalize_candidate_record(candidate, source_role, occurrence_index))

    return {
        **preserved_fields,
        "schema_version": POOL_SCHEMA_VERSION,
        "candidates": candidates,
    }


def normalize_pool_data(pool: dict) -> dict:
    """Normalize a populated pool file into the unified persisted schema."""
    normalized = deepcopy(pool)
    normalized["schema_version"] = POOL_SCHEMA_VERSION
    for species in normalized.get("species", []):
        species["audio_clips"] = normalize_audio_clips(species.get("audio_clips"))
    return normalized


def load_pool_file(path: str | Path) -> dict:
    """Read a populated pool file and normalize it to the current schema."""
    with open(path) as f:
        return normalize_pool_data(json.load(f))


def save_pool_file(path: str | Path, pool: dict) -> dict:
    """Normalize and persist a populated pool file in the current schema."""
    normalized = normalize_pool_data(pool)
    with open(path, "w") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)
    return normalized


def _validate_export_mode(export_mode: str) -> str:
    if export_mode not in {"all", "commercial"}:
        raise ValueError(f"unsupported export mode: {export_mode}")
    return export_mode


def _project_manifest_clip(candidate: dict) -> dict:
    excluded_keys = {"candidate_id", "source_role", "selected_role", "analysis", "segment"}
    return {key: value for key, value in candidate.items() if key not in excluded_keys}


def _export_candidate_sort_key(candidate: dict) -> tuple[float, float, str]:
    score = candidate.get("score")
    if score is None:
        score = score_candidate(candidate)
    rank = candidate.get("rank")
    if rank is None:
        rank = float("inf")
    return (float(score), -float(rank), str(candidate.get("candidate_id", "")))


def _candidate_matches_role(candidate: dict, role: str) -> bool:
    if candidate.get("selected_role") == role or candidate.get("source_role") == role:
        return True
    xc_types = parse_xc_types(candidate.get("xc_types", candidate.get("xc_type", candidate.get("type"))))
    return role in xc_types


def _selected_candidates_for_role(candidates: list[dict], role: str) -> list[dict]:
    return sorted(
        [candidate for candidate in candidates if candidate.get("selected_role") == role],
        key=_export_candidate_sort_key,
        reverse=True,
    )


def _find_best_commercial_substitute(
    candidates: list[dict],
    role: str,
    *,
    used_candidate_ids: set[str],
    used_xc_ids: set[str],
    excluded_candidate_ids: set[str] | None = None,
) -> dict | None:
    excluded_candidate_ids = excluded_candidate_ids or set()
    eligible = [
        candidate
        for candidate in candidates
        if candidate.get("commercial_ok")
        and _candidate_matches_role(candidate, role)
        and candidate.get("candidate_id") not in used_candidate_ids
        and candidate.get("candidate_id") not in excluded_candidate_ids
        and candidate.get("xc_id") not in used_xc_ids
    ]
    if not eligible:
        return None
    return sorted(eligible, key=_export_candidate_sort_key, reverse=True)[0]


def validate_role_assignments(audio_clips: dict | None, export_mode: str = "all") -> dict:
    """Summarize assignment coverage, conflicts, and commercial substitution opportunities."""
    _validate_export_mode(export_mode)
    normalized = normalize_audio_clips(audio_clips)
    candidates = normalized.get("candidates", [])
    selected_by_role = {
        role: _selected_candidates_for_role(candidates, role)
        for role in ("song", "call")
    }

    warnings = []
    errors = []
    seen_xc_ids: dict[str, str] = {}
    counts = {role: len(role_candidates) for role, role_candidates in selected_by_role.items()}

    for role, count in counts.items():
        if count == 0:
            warnings.append(
                f"{role.title()} role is missing any assigned candidate; export will be sparse."
            )
        elif count == 1:
            warnings.append(
                f"{role.title()} role has only 1 assigned candidate; export is below the target depth of 2."
            )

    for role, role_candidates in selected_by_role.items():
        for candidate in role_candidates:
            xc_id = str(candidate.get("xc_id", "") or "")
            if not xc_id:
                continue
            prior_role = seen_xc_ids.get(xc_id)
            if prior_role is not None and prior_role != role:
                errors.append(
                    f"XC{xc_id} is assigned to both {prior_role} and {role}; exported roles must remain singular."
                )
            else:
                seen_xc_ids[xc_id] = role

    substitution_opportunities = []
    if export_mode == "commercial":
        for role, role_candidates in selected_by_role.items():
            for candidate in role_candidates:
                if candidate.get("commercial_ok"):
                    continue
                competing_selected = [
                    selected
                    for selected_role_candidates in selected_by_role.values()
                    for selected in selected_role_candidates
                    if selected.get("candidate_id") != candidate.get("candidate_id")
                ]
                substitute = _find_best_commercial_substitute(
                    candidates,
                    role,
                    used_candidate_ids={str(item.get("candidate_id", "")) for item in competing_selected},
                    used_xc_ids={str(item.get("xc_id", "")) for item in competing_selected},
                    excluded_candidate_ids={str(candidate.get("candidate_id", ""))},
                )
                if substitute is None:
                    warnings.append(
                        f"Commercial export has no commercial-compatible replacement for {role} XC{candidate.get('xc_id')}; that gap will remain explicit."
                    )
                    continue
                substitution_opportunities.append({
                    "role": role,
                    "selected_candidate_id": candidate.get("candidate_id"),
                    "selected_xc_id": candidate.get("xc_id"),
                    "substitute_candidate_id": substitute.get("candidate_id"),
                    "substitute_xc_id": substitute.get("xc_id"),
                    "score_delta": round(
                        float(candidate.get("score", score_candidate(candidate)))
                        - float(substitute.get("score", score_candidate(substitute))),
                        3,
                    ),
                })

    return {
        "counts": counts,
        "warnings": warnings,
        "errors": errors,
        "substitution_opportunities": substitution_opportunities,
    }


def build_export_audio_clips(audio_clips: dict | None, export_mode: str = "all") -> dict:
    """Resolve unified candidates into exportable manifest roles for one license mode."""
    _validate_export_mode(export_mode)
    normalized = normalize_audio_clips(audio_clips)
    candidates = normalized.get("candidates", [])
    validator = validate_role_assignments(normalized, export_mode=export_mode)
    manifest_audio = {"songs": [], "calls": []}
    resolved_candidates = {"songs": [], "calls": []}
    warnings = list(validator["warnings"])
    errors = list(validator["errors"])
    substitutions = []
    used_candidate_ids: set[str] = set()
    used_xc_ids: set[str] = set()

    for role in ("song", "call"):
        for candidate in _selected_candidates_for_role(candidates, role):
            resolved_candidate = candidate
            if export_mode == "commercial" and not candidate.get("commercial_ok"):
                substitute = _find_best_commercial_substitute(
                    candidates,
                    role,
                    used_candidate_ids=used_candidate_ids,
                    used_xc_ids=used_xc_ids,
                    excluded_candidate_ids={str(candidate.get("candidate_id", ""))},
                )
                if substitute is None:
                    continue
                score_delta = round(
                    float(candidate.get("score", score_candidate(candidate)))
                    - float(substitute.get("score", score_candidate(substitute))),
                    3,
                )
                warning = (
                    f"Commercial export substituted {role} XC{candidate.get('xc_id')} with XC{substitute.get('xc_id')} "
                    f"for licensing compatibility; quality tradeoff {score_delta:.1f} points."
                )
                warnings.append(warning)
                substitutions.append({
                    "role": role,
                    "selected_candidate_id": candidate.get("candidate_id"),
                    "selected_xc_id": candidate.get("xc_id"),
                    "substitute_candidate_id": substitute.get("candidate_id"),
                    "substitute_xc_id": substitute.get("xc_id"),
                })
                resolved_candidate = substitute

            candidate_id = str(resolved_candidate.get("candidate_id", "") or "")
            xc_id = str(resolved_candidate.get("xc_id", "") or "")
            if candidate_id in used_candidate_ids or (xc_id and xc_id in used_xc_ids):
                errors.append(
                    f"Skipping duplicate export candidate for {role}: XC{xc_id or '?'} is already used by another exported role."
                )
                continue

            used_candidate_ids.add(candidate_id)
            if xc_id:
                used_xc_ids.add(xc_id)
            resolved_candidates[f"{role}s"].append(deepcopy(resolved_candidate))
            manifest_audio[f"{role}s"].append(_project_manifest_clip(resolved_candidate))
    return {
        "audio_clips": manifest_audio,
        "resolved_candidates": resolved_candidates,
        "warnings": warnings,
        "errors": errors,
        "substitutions": substitutions,
        "validator": validator,
    }


def build_manifest_audio_clips(audio_clips: dict | None, export_mode: str = "all") -> dict:
    """Project unified candidates back into the app's legacy songs/calls shape."""
    return build_export_audio_clips(audio_clips, export_mode=export_mode)["audio_clips"]


def build_review_audio_clips(audio_clips: dict | None) -> dict:
    """Project unified candidates into source-role sections for the legacy admin UI."""
    normalized = normalize_audio_clips(audio_clips)
    review_audio = {"songs": [], "calls": []}
    excluded_keys = {"selected_role"}
    for candidate in normalized.get("candidates", []):
        source_role = candidate.get("source_role")
        if source_role not in {"song", "call"}:
            continue
        clip = {key: value for key, value in candidate.items() if key not in excluded_keys}
        clip["selected"] = candidate.get("selected_role") == source_role
        review_audio[f"{source_role}s"].append(clip)
    return review_audio


def require_xc_api_key() -> str:
    if not XC_API_KEY:
        print("Error: XC_API_KEY environment variable not set.")
        print("Get your key at https://xeno-canto.org/account and add it to your shell profile.")
        sys.exit(1)
    return XC_API_KEY


def parse_birdnet_csv(csv_text: str, target_common_name: str, target_scientific_name: str) -> dict:
    """Normalize BirdNET CSV output into target and overlap detections."""
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        fieldnames = reader.fieldnames or []
        required = {
            "Start (s)",
            "End (s)",
            "Scientific name",
            "Common name",
            "Confidence",
        }
        if not required.issubset(fieldnames):
            missing = sorted(required - set(fieldnames))
            raise ValueError(f"missing required columns: {', '.join(missing)}")

        target_detections = []
        overlap_detections = []
        for row in reader:
            detection = {
                "start_s": float(row["Start (s)"]),
                "end_s": float(row["End (s)"]),
                "confidence": float(row["Confidence"]),
                "scientific_name": row["Scientific name"],
                "common_name": row["Common name"],
            }
            if (
                row["Scientific name"] == target_scientific_name
                or row["Common name"] == target_common_name
            ):
                target_detections.append(detection)
            else:
                overlap_detections.append(detection)

        overlap_species = []
        for detection in overlap_detections:
            common_name = detection["common_name"]
            if common_name and common_name not in overlap_species:
                overlap_species.append(common_name)

        max_target_confidence = None
        if target_detections:
            max_target_confidence = max(d["confidence"] for d in target_detections)

        return normalize_analysis_payload({
            "status": "ok",
            "provider": "birdnet",
            "target_detections": target_detections,
            "overlap_detections": overlap_detections,
            "summary": {
                "target_detection_count": len(target_detections),
                "overlap_detection_count": len(overlap_detections),
                "max_target_confidence": max_target_confidence,
                "top_overlap_species": overlap_species[:3],
            },
            "failure": None,
        })
    except Exception as exc:
        return normalize_analysis_payload({
            "status": "parse_failed",
            "provider": "birdnet",
            "summary": None,
            "failure": {
                "code": "birdnet_parse_failed",
                "message": str(exc),
            },
        })


def resolve_birdnet_command(env: dict | None = None) -> tuple[list[str] | None, dict | None]:
    """Resolve the external BirdNET command from environment configuration."""
    env = env or os.environ

    raw_command = (env.get("BIRDNET_COMMAND") or "").strip()
    if raw_command:
        command = shlex.split(raw_command)
    else:
        birdnet_home = (env.get("BIRDNET_HOME") or "").strip()
        command = None
        candidate_homes = []
        if birdnet_home:
            candidate_homes.append(Path(birdnet_home).expanduser())
        candidate_homes.append(Path.home() / "Code" / "BirdNET-Analyzer")

        for home in candidate_homes:
            candidates = [
                home / ".venv" / "bin" / "birdnet-analyze",
                home / "venv" / "bin" / "birdnet-analyze",
                home / "birdnet-analyze",
            ]
            for candidate in candidates:
                if candidate.exists():
                    command = [str(candidate)]
                    break
            if command is not None:
                break

        if command is None:
            path_command = shutil.which("birdnet-analyze")
            if path_command:
                command = [path_command]

        if command is None:
            return None, {
                "code": "birdnet_not_configured",
                "message": (
                    "BirdNET is not configured. Set BIRDNET_COMMAND or BIRDNET_HOME, install birdnet-analyze on PATH, "
                    "or place BirdNET-Analyzer at ~/Code/BirdNET-Analyzer."
                ),
            }

    executable = shutil.which(command[0]) if command[0] else None
    if executable is None:
        expanded = Path(command[0]).expanduser()
        if expanded.exists():
            executable = str(expanded)

    if executable is None:
        return None, {
            "code": "birdnet_executable_not_found",
            "message": f"BirdNET executable not found: {command[0]}",
        }

    return [executable, *command[1:]], None


def analyze_audio_with_birdnet(
    audio_path: str | Path,
    target_common_name: str,
    target_scientific_name: str,
    env: dict | None = None,
    runner=subprocess.run,
) -> dict:
    """Run BirdNET for one audio file, returning structured fallback status on errors."""
    command, failure = resolve_birdnet_command(env=env)
    if failure:
        return normalize_analysis_payload({
            "status": "unavailable",
            "provider": "birdnet",
            "summary": None,
            "failure": failure,
        })

    min_confidence = float((env or os.environ).get("BIRDNET_MIN_CONFIDENCE", "0.2"))
    timeout_sec = int((env or os.environ).get("BIRDNET_TIMEOUT_SEC", "180"))
    audio_path = Path(audio_path)

    with tempfile.TemporaryDirectory(prefix="beakspeak-birdnet-") as output_dir:
        command_args = [
            *command,
            str(audio_path),
            "-o",
            output_dir,
            "--rtype",
            "csv",
            "--min_conf",
            str(min_confidence),
            "--threads",
            "1",
        ]
        try:
            completed = runner(
                command_args,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                check=False,
            )
        except Exception as exc:
            return normalize_analysis_payload({
                "status": "failed",
                "provider": "birdnet",
                "summary": None,
                "failure": {
                    "code": "birdnet_command_failed",
                    "message": str(exc),
                },
            })

        if completed.returncode != 0:
            failure_message = (completed.stderr or completed.stdout or "").strip() or "BirdNET exited with a non-zero status"
            return normalize_analysis_payload({
                "status": "failed",
                "provider": "birdnet",
                "summary": None,
                "failure": {
                    "code": "birdnet_command_failed",
                    "message": failure_message,
                },
            })

        result_path = Path(output_dir) / f"{audio_path.stem}.BirdNET.results.csv"
        if not result_path.exists():
            return normalize_analysis_payload({
                "status": "failed",
                "provider": "birdnet",
                "summary": None,
                "failure": {
                    "code": "birdnet_results_missing",
                    "message": f"BirdNET did not produce a CSV result for {audio_path.name}",
                },
            })

        return parse_birdnet_csv(
            result_path.read_text(),
            target_common_name=target_common_name,
            target_scientific_name=target_scientific_name,
        )


def download_candidate_audio_for_birdnet(candidate: dict, temp_dir: str | Path) -> Path:
    """Download or resolve candidate audio to a local path for BirdNET analysis."""
    audio_url = str(candidate.get("audio_url", "") or "")
    if not audio_url:
        raise ValueError("candidate is missing audio_url")

    local_path = Path(audio_url).expanduser()
    if local_path.exists():
        return local_path

    response = SESSION.get(audio_url, timeout=30)
    response.raise_for_status()
    suffix = Path(audio_url).suffix or ".audio"
    destination = Path(temp_dir) / f"{candidate.get('candidate_id', 'candidate')}{suffix}"
    destination.write_bytes(response.content)
    return destination


def analyze_candidates_with_birdnet(
    candidates: list[dict],
    target_common_name: str,
    target_scientific_name: str,
    env: dict | None = None,
    runner=subprocess.run,
    downloader=None,
) -> dict:
    """Attach BirdNET analysis to candidate records and return a species-level status summary."""
    env = env or os.environ
    _command, failure = resolve_birdnet_command(env=env)

    ok_candidates = 0
    fallback_candidates = 0
    warning = None

    if failure:
        warning = f"WARNING: BirdNET unavailable; using FFmpeg-only fallback. {failure['message']}"
        for candidate in candidates:
            candidate["analysis"] = normalize_analysis_payload({
                "status": "unavailable",
                "provider": "birdnet",
                "summary": None,
                "failure": failure,
            })
            fallback_candidates += 1
        return {
            "status": "ffmpeg_only_fallback",
            "ok_candidates": 0,
            "fallback_candidates": fallback_candidates,
            "warning": warning,
        }

    with tempfile.TemporaryDirectory(prefix="beakspeak-birdnet-audio-") as temp_dir:
        if downloader is None:
            downloader = lambda candidate: download_candidate_audio_for_birdnet(candidate, temp_dir)

        for candidate in candidates:
            try:
                local_audio_path = downloader(candidate)
                analysis = analyze_audio_with_birdnet(
                    local_audio_path,
                    target_common_name=target_common_name,
                    target_scientific_name=target_scientific_name,
                    env=env,
                    runner=runner,
                )
            except Exception as exc:
                analysis = normalize_analysis_payload({
                    "status": "failed",
                    "provider": "birdnet",
                    "summary": None,
                    "failure": {
                        "code": "birdnet_input_unavailable",
                        "message": str(exc),
                    },
                })

            candidate["analysis"] = analysis
            if analysis["status"] == "ok":
                ok_candidates += 1
            else:
                fallback_candidates += 1
                if warning is None:
                    failure_message = analysis.get("failure", {}).get("message") or "BirdNET analysis failed"
                    warning = f"WARNING: BirdNET unavailable; using FFmpeg-only fallback. {failure_message}"

    return {
        "status": "birdnet_assisted" if ok_candidates else "ffmpeg_only_fallback",
        "ok_candidates": ok_candidates,
        "fallback_candidates": fallback_candidates,
        "warning": warning,
    }


def probe_audio_duration(audio_path: str | Path, runner=subprocess.run) -> float | None:
    """Read audio duration via ffprobe. Returns None when probing fails."""
    completed = runner(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None

    try:
        duration = float((completed.stdout or "").strip())
    except ValueError:
        return None
    return duration if duration > 0 else None


def detect_active_regions(audio_path: str | Path, runner=subprocess.run) -> list[tuple[float, float]]:
    """Return non-silent audio regions detected by ffmpeg silencedetect."""
    completed = runner(
        [
            "ffmpeg",
            "-i",
            str(audio_path),
            "-af",
            "silencedetect=noise=-30dB:d=0.5",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return []

    silence_starts: list[float] = []
    silence_ends: list[float] = []
    for line in completed.stderr.splitlines():
        silence_start = re.search(r"silence_start:\s*([\d.]+)", line)
        if silence_start:
            silence_starts.append(float(silence_start.group(1)))
        silence_end = re.search(r"silence_end:\s*([\d.]+)", line)
        if silence_end:
            silence_ends.append(float(silence_end.group(1)))

    duration = probe_audio_duration(audio_path, runner=runner) or 0.0
    if not silence_starts and not silence_ends:
        return [(0.0, duration)] if duration > 0 else []

    regions: list[tuple[float, float]] = []
    if silence_starts and silence_starts[0] > 0:
        regions.append((0.0, silence_starts[0]))

    for index, silence_end in enumerate(silence_ends):
        next_start = silence_starts[index + 1] if index + 1 < len(silence_starts) else duration
        if next_start > silence_end:
            regions.append((silence_end, next_start))

    return [(start_s, end_s) for start_s, end_s in regions if end_s > start_s]


def _clamp_segment_window(center_s: float, duration_s: float, audio_duration_s: float) -> tuple[float, float]:
    duration_s = max(0.0, min(float(duration_s), float(audio_duration_s)))
    max_start = max(float(audio_duration_s) - duration_s, 0.0)
    start_s = min(max(center_s - duration_s / 2, 0.0), max_start)
    end_s = min(start_s + duration_s, float(audio_duration_s))
    start_s = max(0.0, end_s - duration_s)
    return start_s, end_s


def _collapse_target_regions(target_detections: list[dict]) -> list[dict]:
    regions = []
    for detection in sorted(target_detections, key=lambda item: (item.get("start_s", 0.0), item.get("end_s", 0.0))):
        start_s = float(detection.get("start_s", 0.0))
        end_s = float(detection.get("end_s", start_s))
        confidence = float(detection.get("confidence", 0.0))
        if not regions or start_s > regions[-1]["end_s"] + TARGET_REGION_GAP_S:
            regions.append({
                "start_s": start_s,
                "end_s": end_s,
                "max_confidence": confidence,
            })
            continue

        regions[-1]["end_s"] = max(regions[-1]["end_s"], end_s)
        regions[-1]["max_confidence"] = max(regions[-1]["max_confidence"], confidence)

    return regions


def select_segment_window(
    candidate: dict,
    audio_duration_s: float,
    active_regions: list[tuple[float, float]] | None = None,
) -> dict:
    """Choose a persisted segment window from BirdNET evidence or FFmpeg heuristics."""
    audio_duration_s = max(float(audio_duration_s), 0.1)
    analysis = normalize_analysis_payload(candidate.get("analysis"))
    target_regions = _collapse_target_regions(analysis.get("target_detections") or [])

    if target_regions:
        best_region = max(
            target_regions,
            key=lambda region: (region["max_confidence"], region["end_s"] - region["start_s"]),
        )
        region_center_s = (best_region["start_s"] + best_region["end_s"]) / 2
        region_span_s = best_region["end_s"] - best_region["start_s"]

        if region_span_s <= PREFERRED_SEGMENT_DURATION_S - 1:
            start_s, end_s = _clamp_segment_window(
                region_center_s,
                PREFERRED_SEGMENT_DURATION_S,
                audio_duration_s,
            )
            return _build_segment_payload(
                status="birdnet_target_centered",
                start_s=start_s,
                end_s=end_s,
                confidence=best_region["max_confidence"],
                fallback_reason=None,
            )

        duration_s = min(
            MAX_FALLBACK_SEGMENT_DURATION_S,
            max(region_span_s + TARGET_REGION_PADDING_S * 2, PREFERRED_SEGMENT_DURATION_S + 1),
        )
        start_s, end_s = _clamp_segment_window(region_center_s, duration_s, audio_duration_s)
        if start_s > best_region["start_s"] or end_s < best_region["end_s"]:
            start_s = max(0.0, min(best_region["start_s"] - TARGET_REGION_PADDING_S, audio_duration_s - duration_s))
            end_s = min(audio_duration_s, start_s + duration_s)
            start_s = max(0.0, end_s - duration_s)
        return _build_segment_payload(
            status="birdnet_extended_context",
            start_s=start_s,
            end_s=end_s,
            confidence=best_region["max_confidence"],
            fallback_reason="target_region_requires_more_context",
        )

    active_regions = active_regions or []
    if active_regions:
        best_start_s, best_end_s = max(active_regions, key=lambda region: (region[1] - region[0], region[0]))
        region_center_s = (best_start_s + best_end_s) / 2
        start_s, end_s = _clamp_segment_window(region_center_s, PREFERRED_SEGMENT_DURATION_S, audio_duration_s)
        fallback_reason = analysis.get("failure", {}).get("code") or "ffmpeg_active_region_fallback"
        return _build_segment_payload(
            status="ffmpeg_heuristic",
            start_s=start_s,
            end_s=end_s,
            confidence=None,
            fallback_reason=fallback_reason,
        )

    fallback_duration_s = min(audio_duration_s, MAX_FALLBACK_SEGMENT_DURATION_S)
    fallback_reason = analysis.get("failure", {}).get("code") or "no_active_region_detected"
    return _build_segment_payload(
        status="ffmpeg_full_clip_fallback",
        start_s=0.0,
        end_s=fallback_duration_s,
        confidence=None,
        fallback_reason=fallback_reason,
    )


def attach_candidate_segments(
    candidates: list[dict],
    runner=subprocess.run,
    downloader=None,
) -> dict:
    """Persist segment windows on candidate records for later preview/export reuse."""
    summary = {"birdnet_target_centered": 0, "birdnet_extended_context": 0, "ffmpeg_fallback": 0}

    with tempfile.TemporaryDirectory(prefix="beakspeak-segments-audio-") as temp_dir:
        if downloader is None:
            downloader = lambda candidate: download_candidate_audio_for_birdnet(candidate, temp_dir)

        for candidate in candidates:
            audio_duration_s = MAX_FALLBACK_SEGMENT_DURATION_S
            try:
                local_audio_path = downloader(candidate)
                audio_duration_s = probe_audio_duration(local_audio_path, runner=runner) or MAX_FALLBACK_SEGMENT_DURATION_S
                active_regions = detect_active_regions(local_audio_path, runner=runner)
                candidate["segment"] = select_segment_window(
                    candidate,
                    audio_duration_s=audio_duration_s,
                    active_regions=active_regions,
                )
            except Exception as exc:
                candidate["segment"] = _build_segment_payload(
                    status="ffmpeg_full_clip_fallback",
                    start_s=0.0,
                    end_s=min(MAX_FALLBACK_SEGMENT_DURATION_S, audio_duration_s),
                    confidence=None,
                    fallback_reason=f"segment_selection_failed:{exc}",
                )

            status = candidate["segment"]["status"]
            if status == "birdnet_target_centered":
                summary["birdnet_target_centered"] += 1
            elif status == "birdnet_extended_context":
                summary["birdnet_extended_context"] += 1
            else:
                summary["ffmpeg_fallback"] += 1

    return summary


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


def parse_background_species(also_value: str | list[str] | None) -> list[str]:
    """Normalize XC `also` metadata into a stable species list."""
    if isinstance(also_value, list):
        return [item.strip() for item in also_value if isinstance(item, str) and item.strip()]
    if not also_value:
        return []
    return [item.strip() for item in str(also_value).split(",") if item.strip()]


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


def infer_source_role(xc_types: list[str]) -> str:
    """Choose a source-role hint for mixed candidates without making final role decisions."""
    lowered = [xc_type.lower() for xc_type in xc_types]
    for xc_type in lowered:
        if "call" in xc_type:
            return "call"
        if "song" in xc_type:
            return "song"
    return "song"


def score_candidate(candidate: dict) -> float:
    """Score a unified candidate using XC metadata plus optional analysis signals."""
    base_score = score_recording({
        "q": candidate.get("quality", ""),
        "length": candidate.get("length", ""),
        "loc": candidate.get("location", ""),
        "cnt": candidate.get("country", ""),
        "rmk": candidate.get("remarks", ""),
        "animal-seen": candidate.get("animal_seen", ""),
        "playback-used": candidate.get("playback_used", ""),
        "stage": candidate.get("stage", ""),
        "method": candidate.get("method", ""),
    })

    commercial_bonus = 2 if candidate.get("commercial_ok") else 0

    xc_types = parse_xc_types(candidate.get("xc_types", candidate.get("type")))
    compound_penalty = -1 if len(xc_types) > 1 else 0

    background_species = parse_background_species(candidate.get("also"))
    background_penalty = -18 - max(len(background_species) - 1, 0) * 4 if background_species else 0

    analysis = normalize_analysis_payload(candidate.get("analysis"))
    analysis_status = analysis.get("status")
    analysis_bonus = 0.0
    analysis_penalty = 0.0
    if analysis_status == "ok":
        summary = analysis.get("summary") or {}
        target_confidence = summary.get("max_target_confidence") or 0
        overlap_count = summary.get("overlap_detection_count") or 0
        analysis_bonus = float(target_confidence) * 30
        analysis_penalty = float(overlap_count) * 8

    return round(
        base_score + commercial_bonus + compound_penalty + background_penalty + analysis_bonus - analysis_penalty,
        2,
    )


def build_ranking_signals(candidate: dict) -> dict:
    """Persist rank-affecting signals for later admin review and debugging."""
    background_species = parse_background_species(candidate.get("also"))
    analysis = normalize_analysis_payload(candidate.get("analysis"))
    summary = analysis.get("summary") or {}
    return {
        "xc_score": round(score_recording({
            "q": candidate.get("quality", ""),
            "length": candidate.get("length", ""),
            "loc": candidate.get("location", ""),
            "cnt": candidate.get("country", ""),
            "rmk": candidate.get("remarks", ""),
            "animal-seen": candidate.get("animal_seen", ""),
            "playback-used": candidate.get("playback_used", ""),
            "stage": candidate.get("stage", ""),
            "method": candidate.get("method", ""),
        }), 2),
        "commercial_ok": bool(candidate.get("commercial_ok")),
        "background_species": background_species,
        "background_species_penalty": -18 - max(len(background_species) - 1, 0) * 4 if background_species else 0,
        "analysis_status": analysis.get("status"),
        "birdnet_max_target_confidence": summary.get("max_target_confidence"),
        "birdnet_overlap_count": summary.get("overlap_detection_count"),
    }


def build_candidate_from_xc_recording(rec: dict, occurrence_index: int) -> dict:
    """Convert a XC recording into the unified candidate shape."""
    xc_types = parse_xc_types(rec.get("type", ""))
    source_role = infer_source_role(xc_types)
    candidate = normalize_candidate_record({
        "xc_id": rec.get("id", ""),
        "candidate_id": build_candidate_id(str(rec.get("id", "")), source_role, occurrence_index),
        "xc_url": f"https://xeno-canto.org/{rec.get('id', '')}",
        "audio_url": rec.get("file", ""),
        "type": rec.get("type", ""),
        "xc_type": rec.get("type", ""),
        "xc_types": xc_types,
        "quality": rec.get("q", ""),
        "length": rec.get("length", ""),
        "recordist": rec.get("rec", ""),
        "license": rec.get("lic", ""),
        "location": rec.get("loc", ""),
        "country": rec.get("cnt", ""),
        "commercial_ok": is_commercial_license(rec.get("lic", "")),
        "selected_role": "none",
        "sex": rec.get("sex", ""),
        "stage": rec.get("stage", ""),
        "method": rec.get("method", ""),
        "remarks": rec.get("rmk", ""),
        "animal_seen": rec.get("animal-seen", ""),
        "playback_used": rec.get("playback-used", ""),
        "also": rec.get("also", ""),
    }, source_role, occurrence_index)
    candidate["score"] = score_candidate(candidate)
    candidate["ranking_signals"] = build_ranking_signals(candidate)
    return candidate


def count_candidates_by_source_role(candidates: list[dict]) -> dict[str, int]:
    counts = {"song": 0, "call": 0}
    for candidate in candidates:
        source_role = candidate.get("source_role")
        if source_role in counts:
            counts[source_role] += 1
    return counts


def candidate_quality_warnings(
    species_name: str,
    candidates: list[dict],
    degraded_analysis_count: int,
) -> list[str]:
    """Summarize quality gaps that should be surfaced to the curator."""
    warnings = []
    if degraded_analysis_count:
        warnings.append(
            f"{species_name}: analysis unavailable or degraded for {degraded_analysis_count} candidate(s); ranking is using metadata-only fallback where needed."
        )

    if len(candidates) < 4:
        warnings.append(
            f"{species_name}: only {len(candidates)} ranked candidate(s) available after filtering; manual review will be sparse."
        )

    top_candidates = candidates[: min(3, len(candidates))]
    if any(parse_background_species(candidate.get("also")) for candidate in top_candidates):
        warnings.append(
            f"{species_name}: top-ranked candidates still include background-species metadata; manual review should listen closely."
        )

    return warnings


def rank_candidate_pool(candidates: list[dict], species_name: str) -> dict:
    """Sort a mixed candidate pool and attach rank, score, and warning metadata."""
    normalized_candidates = [normalize_candidate_record(candidate, candidate.get("source_role", "song"), index)
                             for index, candidate in enumerate(candidates)]
    ranked_candidates = sorted(
        normalized_candidates,
        key=lambda candidate: (score_candidate(candidate), candidate.get("xc_id", "")),
        reverse=True,
    )
    for index, candidate in enumerate(ranked_candidates, start=1):
        candidate["rank"] = index
        candidate["score"] = score_candidate(candidate)
        candidate["ranking_signals"] = build_ranking_signals(candidate)

    degraded_analysis_count = sum(
        1
        for candidate in ranked_candidates
        if normalize_analysis_payload(candidate.get("analysis")).get("status") != "ok"
    )
    source_role_counts = count_candidates_by_source_role(ranked_candidates)

    return {
        "candidates": ranked_candidates,
        "candidate_count": len(ranked_candidates),
        "source_role_counts": source_role_counts,
        "commercial_clip_count": sum(1 for candidate in ranked_candidates if candidate.get("commercial_ok")),
        "nc_clip_count": sum(1 for candidate in ranked_candidates if not candidate.get("commercial_ok")),
        "degraded_analysis_count": degraded_analysis_count,
        "quality_warnings": candidate_quality_warnings(species_name, ranked_candidates, degraded_analysis_count),
    }


def build_ranked_candidate_pool(recordings: list[dict], species_name: str, max_candidates: int = 10) -> dict:
    """Build one mixed ranked candidate pool for a species."""
    cc_recordings = [recording for recording in recordings if is_any_cc_license(recording.get("lic", ""))]
    occurrence_by_role = {"song": 0, "call": 0}
    candidates = []
    for recording in cc_recordings:
        xc_types = parse_xc_types(recording.get("type", ""))
        source_role = infer_source_role(xc_types)
        occurrence_index = occurrence_by_role[source_role]
        occurrence_by_role[source_role] += 1
        candidate = build_candidate_from_xc_recording(recording, occurrence_index)
        candidates.append(candidate)

    ranked = rank_candidate_pool(candidates, species_name=species_name)
    ranked["candidates"] = ranked["candidates"][:max_candidates]
    ranked["candidate_count"] = len(ranked["candidates"])
    ranked["source_role_counts"] = count_candidates_by_source_role(ranked["candidates"])
    ranked["commercial_clip_count"] = sum(1 for candidate in ranked["candidates"] if candidate.get("commercial_ok"))
    ranked["nc_clip_count"] = sum(1 for candidate in ranked["candidates"] if not candidate.get("commercial_ok"))
    ranked["degraded_analysis_count"] = sum(
        1
        for candidate in ranked["candidates"]
        if normalize_analysis_payload(candidate.get("analysis")).get("status") != "ok"
    )
    ranked["quality_warnings"] = candidate_quality_warnings(
        species_name,
        ranked["candidates"],
        ranked["degraded_analysis_count"],
    )
    return ranked


def query_xc(scientific_name: str, max_pages: int = 2) -> list[dict]:
    """Query Xeno-canto API for recordings of a species."""
    api_key = require_xc_api_key()
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
                params={"query": query, "page": page, "per_page": 500, "key": api_key},
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
                    commercial_ok: bool = True, exclude_ids: set | None = None,
                    n_selected: int | None = None,
                    prefer_pure: bool = False) -> list[dict]:
    """Filter by vocalization type, score, return top N with commercial_ok flag.

    Tokenizes `type` on comma so 'song' substring match doesn't leak from 'subsong',
    and so compound types like 'begging call, subsong' are excluded entirely.

    n_selected: how many of the top N to mark selected=True (rest get False).
                Defaults to all N if not specified.
    prefer_pure: when True, single-type recordings rank above compound types at equal
                 score — keeps the call pool from being consumed by 'call, song' entries.
    """
    exclude_ids = exclude_ids or set()
    if n_selected is None:
        n_selected = n

    def _matches(r):
        if r.get("id", "") in exclude_ids:
            return False
        tokens = [t.strip() for t in r.get("type", "").lower().split(",")]
        if any("subsong" in t for t in tokens):
            return False
        return any(clip_type in t for t in tokens)
    typed = [r for r in recordings if _matches(r)]

    def _sort_key(r):
        is_compound = len([t for t in r.get("type", "").split(",") if t.strip()]) > 1
        return (score_recording(r), not is_compound if prefer_pure else 0)

    ranked = sorted(typed, key=_sort_key, reverse=True)
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
            "selected": i < n_selected,
            "sex": r.get("sex", ""),
            "stage": r.get("stage", ""),
            "method": r.get("method", ""),
            "remarks": r.get("rmk", ""),
            "animal_seen": r.get("animal-seen", ""),
            "playback_used": r.get("playback-used", ""),
        }
        for i, r in enumerate(ranked[:n])
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

    # Filter to any CC license first (ND excluded)
    recs = [r for r in recs if is_any_cc_license(r.get("lic", ""))]
    print(f"  [Xeno-canto] After license filter: {len(recs)}")

    result = build_ranked_candidate_pool(recs, species_name=name)
    sp["audio_clips"] = normalize_audio_clips({"candidates": result["candidates"]})
    print(
        "  [Xeno-canto] ✓ Built mixed candidate pool: "
        f"{len(result['candidates'])} ranked candidate(s) "
        f"({result['source_role_counts']['song']} song-like, {result['source_role_counts']['call']} call-like)"
    )

    birdnet_report = analyze_candidates_with_birdnet(
        sp["audio_clips"].get("candidates", []),
        target_common_name=name,
        target_scientific_name=sci,
    )
    reranked = rank_candidate_pool(sp["audio_clips"].get("candidates", []), species_name=name)
    sp["audio_clips"]["candidates"] = reranked["candidates"]
    segment_summary = attach_candidate_segments(sp["audio_clips"].get("candidates", []))
    result.update({
        "candidates": reranked["candidates"],
        "candidate_count": reranked["candidate_count"],
        "source_role_counts": reranked["source_role_counts"],
        "commercial_clip_count": reranked["commercial_clip_count"],
        "nc_clip_count": reranked["nc_clip_count"],
        "degraded_analysis_count": reranked["degraded_analysis_count"],
        "quality_warnings": reranked["quality_warnings"],
    })
    if birdnet_report["warning"]:
        print(f"  [BirdNET] {birdnet_report['warning']}")
    else:
        print(
            f"  [BirdNET] ✓ Analyzed {birdnet_report['ok_candidates']} candidate(s); "
            f"fallback {birdnet_report['fallback_candidates']}"
        )
    print(
        "  [Segments] ✓ "
        f"{segment_summary['birdnet_target_centered']} target-centered, "
        f"{segment_summary['birdnet_extended_context']} extended-context, "
        f"{segment_summary['ffmpeg_fallback']} FFmpeg fallback"
    )

    for warning in result["quality_warnings"]:
        print(f"  [Quality] ⚠ {warning}")

    if not sp["audio_clips"]["candidates"]:
        print(f"  ✗ NO AUDIO FOUND — manual curation needed for this species")

    result["birdnet"] = birdnet_report
    return result


def format_summary_report(species_results: list[dict]) -> str:
    """Format a summary report of the pipeline run.

    Each entry in species_results has:
      name, candidate_count, source_role_counts, commercial_clips, nc_clips
    """
    lines = []
    lines.append(f"\n{'═'*60}")
    lines.append("  PIPELINE SUMMARY")
    lines.append(f"{'═'*60}")

    # Species with non-commercial candidates in the ranked pool
    nc_species = [s for s in species_results if s["nc_clips"]]
    if nc_species:
        lines.append("\n  Species using non-commercial candidates:")
        for s in nc_species:
            lines.append(f"    - {s['name']}: {s['nc_clips']} NC clip(s)")
    else:
        lines.append("\n  No species required non-commercial candidates")

    sparse = [s for s in species_results if s["candidate_count"] < 4]
    if sparse:
        lines.append("\n  Sparse mixed pools:")
        for s in sparse:
            counts = s.get("source_role_counts", {})
            lines.append(
                f"    - {s['name']}: {s['candidate_count']} candidates "
                f"({counts.get('song', 0)} song-like, {counts.get('call', 0)} call-like)"
            )
    else:
        lines.append("\n  All species have at least 4 ranked candidates")

    quality_gap_species = [s for s in species_results if s.get("quality_warnings")]
    if quality_gap_species:
        lines.append("\n  Mixed-pool quality gaps:")
        for s in quality_gap_species:
            for warning in s.get("quality_warnings", []):
                lines.append(f"    - {warning}")

    degraded_analysis = [s for s in species_results if s.get("degraded_analysis_count")]
    if degraded_analysis:
        lines.append("\n  BirdNET degraded-analysis species:")
        for s in degraded_analysis:
            lines.append(
                f"    - {s['name']}: {s.get('degraded_analysis_count', 0)} candidate(s) missing BirdNET-backed ranking input"
            )

    birdnet_assisted = [s for s in species_results if s.get("birdnet_status") == "birdnet_assisted"]
    birdnet_fallback = [s for s in species_results if s.get("birdnet_status") == "ffmpeg_only_fallback"]
    if birdnet_assisted:
        lines.append("\n  BirdNET-assisted species:")
        for s in birdnet_assisted:
            lines.append(
                f"    - {s['name']}: {s.get('birdnet_ok_candidates', 0)} analyzed, "
                f"{s.get('birdnet_fallback_candidates', 0)} fallback"
            )
    if birdnet_fallback:
        lines.append("\n  FFmpeg-only fallback species:")
        for s in birdnet_fallback:
            lines.append(
                f"    - {s['name']}: {s.get('birdnet_ok_candidates', 0)} analyzed, "
                f"{s.get('birdnet_fallback_candidates', 0)} fallback"
            )

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

    # Preserve any manually-set selected flags from a prior run
    out_path = manifest_path.parent / "tier1_seattle_birds_populated.json"
    prior_role_assignments: dict[tuple[str, str, str], str] = {}
    if out_path.exists():
        try:
            prior = load_pool_file(out_path)
            for sp in prior.get("species", []):
                for candidate in sp.get("audio_clips", {}).get("candidates", []):
                    xc_id = candidate.get("xc_id", "")
                    source_role = candidate.get("source_role", "")
                    selected_role = candidate.get("selected_role", "none")
                    if xc_id and source_role:
                        prior_role_assignments[(sp.get("id", ""), source_role, xc_id)] = selected_role
        except Exception:
            pass

    species = manifest["species"]
    print("=" * 60)
    print("  BeakSpeak — Content Population")
    print("=" * 60)
    print(f"  Species: {len(species)}")
    print(f"  Photo source: Wikipedia infobox (CC-BY-SA)")
    print(f"  Audio source: Xeno-canto (prefer commercial CC; fallback NC)")
    print(f"  Region tiebreaker: Washington > PNW > California (small bonus only)")
    birdnet_command, birdnet_failure = resolve_birdnet_command()
    if birdnet_failure:
        print("  !!! BirdNET status: UNAVAILABLE")
        print(f"  !!! FFmpeg-only fallback will be used: {birdnet_failure['message']}")
    else:
        print(f"  BirdNET command: {' '.join(birdnet_command)}")
    print("=" * 60)

    species_results = []
    for i, sp in enumerate(species, 1):
        print(f"\n[{i}/{len(species)}]", end="")
        result = process_species(sp)
        if result:
            # Restore prior role selections after normalizing into the new schema.
            if prior_role_assignments:
                for candidate in sp.get("audio_clips", {}).get("candidates", []):
                    key = (sp.get("id", ""), candidate.get("source_role", ""), candidate.get("xc_id", ""))
                    if key in prior_role_assignments:
                        candidate["selected_role"] = prior_role_assignments[key]
            all_clips = sp.get("audio_clips", {}).get("candidates", [])
            commercial_clips = sum(1 for c in all_clips if c.get("commercial_ok"))
            nc_clips = sum(1 for c in all_clips if not c.get("commercial_ok"))
            quality_counts = {}
            for c in all_clips:
                q = c.get("quality") or "?"
                quality_counts[q] = quality_counts.get(q, 0) + 1
            species_results.append({
                "name": sp["common_name"],
                "candidate_count": len(all_clips),
                "source_role_counts": count_candidates_by_source_role(all_clips),
                "commercial_clips": commercial_clips,
                "nc_clips": nc_clips,
                "quality_warnings": result.get("quality_warnings", []),
                "degraded_analysis_count": result.get("degraded_analysis_count", 0),
                "quality_counts": quality_counts,
                "birdnet_status": result.get("birdnet", {}).get("status"),
                "birdnet_ok_candidates": result.get("birdnet", {}).get("ok_candidates", 0),
                "birdnet_fallback_candidates": result.get("birdnet", {}).get("fallback_candidates", 0),
                "birdnet_warning": result.get("birdnet", {}).get("warning"),
            })
        time.sleep(1.0)

    # ── Summary ───────────────────────────────────────────────
    photos_found = sum(1 for s in species if s.get("photo", {}).get("url"))
    songs_total = sum(len(build_review_audio_clips(s.get("audio_clips")).get("songs", [])) for s in species)
    calls_total = sum(len(build_review_audio_clips(s.get("audio_clips")).get("calls", [])) for s in species)
    wiki_audio = sum(len(s.get("wikipedia_audio", [])) for s in species)
    no_audio = sum(1 for s in species
                   if not s.get("audio_clips", {}).get("candidates"))

    save_pool_file(out_path, manifest)

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
            if not clips.get("candidates"):
                print(f"    - {s['common_name']}")

    # Pipeline summary report
    print(format_summary_report(species_results))


if __name__ == "__main__":
    main()

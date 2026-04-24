#!/usr/bin/env python3
"""Export manually trimmed app audio from existing local BeakSpeak audio assets.

This command is intentionally narrow: it reads already-normalized app audio from
beakspeak/public/content/audio and never downloads original Xeno-canto media.
"""

import argparse
import json
import re
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Callable

from populate_content import build_export_audio_clips, load_pool_file, normalize_audio_clips

INPUT_FILE = Path("tier1_seattle_birds_populated.json")
AUDIO_DIR = Path("beakspeak/public/content/audio")
MANIFEST_OUT = Path("beakspeak/public/content/manifest.json")

Runner = Callable[..., subprocess.CompletedProcess]


def is_manual_segment(segment: dict | None) -> bool:
    return (
        isinstance(segment, dict)
        and segment.get("status") == "manual"
        and segment.get("start_s") is not None
        and segment.get("duration_s") is not None
    )


def local_source_path(audio_dir: Path, species_id: str, candidate: dict) -> Path:
    return audio_dir / species_id / f"{candidate['xc_id']}.ogg"


def trimmed_filename(candidate: dict) -> str:
    candidate_id = str(candidate.get("candidate_id", "") or "")
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", candidate_id).strip(".-")
    if not stem:
        stem = str(candidate["xc_id"])
    return f"{stem}.ogg"


def trimmed_output_path(audio_dir: Path, species_id: str, candidate: dict) -> Path:
    return audio_dir / species_id / "trimmed" / trimmed_filename(candidate)


def normal_audio_url(species_id: str, candidate: dict) -> str:
    return f"/content/audio/{species_id}/{candidate['xc_id']}.ogg"


def trimmed_audio_url(species_id: str, candidate: dict) -> str:
    return f"/content/audio/{species_id}/trimmed/{trimmed_filename(candidate)}"


def encode_manual_trim(
    *,
    source: Path,
    output: Path,
    segment: dict,
    runner: Runner = subprocess.run,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp_output = output.with_suffix(".tmp.ogg")
    tmp_output.unlink(missing_ok=True)
    cmd = [
        "ffmpeg",
        "-ss",
        str(segment["start_s"]),
        "-t",
        str(segment["duration_s"]),
        "-i",
        str(source),
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-y",
        str(tmp_output),
    ]
    result = runner(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        tmp_output.unlink(missing_ok=True)
        detail = (result.stderr or "").strip()
        raise RuntimeError(f"ffmpeg failed for {source}: {detail}")
    tmp_output.replace(output)


def prepare_manual_trimmed_audio(
    *,
    data: dict,
    audio_dir: Path,
    force_audio: bool,
    runner: Runner = subprocess.run,
) -> dict:
    generated: list[Path] = []
    skipped: list[Path] = []
    warnings: list[str] = []

    for species in data.get("species", []):
        species_id = species["id"]
        audio_clips = normalize_audio_clips(species.get("audio_clips"))
        species["audio_clips"] = audio_clips
        for candidate in audio_clips.get("candidates", []):
            candidate["audio_url"] = normal_audio_url(species_id, candidate)
            if not is_manual_segment(candidate.get("segment")):
                continue

            source = local_source_path(audio_dir, species_id, candidate)
            output = trimmed_output_path(audio_dir, species_id, candidate)
            candidate["audio_url"] = trimmed_audio_url(species_id, candidate)

            if not source.exists():
                raise FileNotFoundError(
                    f"Missing local source app audio for {species_id} XC{candidate['xc_id']}: {source}. "
                    "Rerun the existing media download/normalization step to redownload the source audio."
                )
            if output.exists() and not force_audio:
                skipped.append(output)
                warnings.append(
                    f"Manual trim for {species_id} XC{candidate['xc_id']} skipped because {output} exists; "
                    "existing trimmed output may be stale. Rerun with --force-audio to regenerate."
                )
                continue

            encode_manual_trim(
                source=source,
                output=output,
                segment=candidate["segment"],
                runner=runner,
            )
            generated.append(output)

    return {"generated": generated, "skipped": skipped, "warnings": warnings}


def build_trim_aware_manifest(data: dict, export_mode: str) -> tuple[dict, list[str], list[str], list[dict]]:
    manifest = deepcopy(data)
    warnings: list[str] = []
    errors: list[str] = []
    substitutions: list[dict] = []

    for species in manifest.get("species", []):
        species.pop("xc_api_query", None)
        species.pop("wikimedia_search", None)
        export_report = build_export_audio_clips(
            species.get("audio_clips"),
            export_mode=export_mode,
        )
        species["audio_clips"] = export_report["audio_clips"]
        warnings.extend(export_report["warnings"])
        errors.extend(export_report["errors"])
        substitutions.extend(export_report["substitutions"])

    return manifest, warnings, errors, substitutions


def export_app_audio(
    *,
    pool_file: str | Path = INPUT_FILE,
    audio_dir: str | Path = AUDIO_DIR,
    manifest_out: str | Path | None = MANIFEST_OUT,
    export_mode: str = "all",
    force_audio: bool = False,
    runner: Runner = subprocess.run,
) -> dict:
    data = load_pool_file(pool_file)
    audio_dir = Path(audio_dir)
    trim_result = prepare_manual_trimmed_audio(
        data=data,
        audio_dir=audio_dir,
        force_audio=force_audio,
        runner=runner,
    )
    manifest, export_warnings, errors, substitutions = build_trim_aware_manifest(data, export_mode)
    warnings = [*trim_result["warnings"], *export_warnings]

    if manifest_out is not None:
        manifest_path = Path(manifest_out)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

    return {
        "manifest": manifest,
        "generated": trim_result["generated"],
        "skipped": trim_result["skipped"],
        "warnings": warnings,
        "errors": errors,
        "substitutions": substitutions,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool-file", default=str(INPUT_FILE), help="Populated candidate pool JSON file.")
    parser.add_argument("--audio-dir", default=str(AUDIO_DIR), help="Existing app audio root.")
    parser.add_argument("--manifest-out", default=str(MANIFEST_OUT), help="Generated app manifest path.")
    parser.add_argument(
        "--export-mode",
        choices=("all", "commercial"),
        default="all",
        help="Resolve selected clips for the generated manifest.",
    )
    parser.add_argument(
        "--force-audio",
        action="store_true",
        help="Regenerate existing trimmed outputs instead of warning and skipping them.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = export_app_audio(
            pool_file=args.pool_file,
            audio_dir=args.audio_dir,
            manifest_out=args.manifest_out,
            export_mode=args.export_mode,
            force_audio=args.force_audio,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    for path in result["generated"]:
        print(f"Generated trimmed audio: {path}")
    for warning in result["warnings"]:
        print(f"Warning: {warning}", file=sys.stderr)
    for error in result["errors"]:
        print(f"Export error: {error}", file=sys.stderr)
    print(f"Manifest written to {args.manifest_out}")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

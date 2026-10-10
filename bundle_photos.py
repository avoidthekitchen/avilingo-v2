#!/usr/bin/env python3
"""Bundle the Wikimedia Commons bird photos named by the base manifest.

The base manifest is the source of truth: each species' `photo.srcset` lists local
`/content/bird-photos/{species_id}-{width}.{ext}` candidates, and `photo.filename`
names the Commons file they come from. This script downloads Wikimedia's own
thumbnail of that file at each width, byte for byte, and records provenance and
hashes in a lock file. The files are committed, so ordinary builds only run
`--check`, which never contacts Wikimedia.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

import requests


LOCK_SCHEMA_VERSION = 2
PHOTO_URL_PREFIX = "/content/bird-photos/"
COMMONS_THUMB_ROOT = "https://thumb.wikimedia.org/wikipedia/commons/thumb"
COMMONS_FILE_PAGE_PREFIX = "https://commons.wikimedia.org/wiki/File:"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
USER_AGENT = "BeakSpeak/1.0 photo bundler (https://beakspeak.app/beakspeak/support/; support@beakspeak.app)"

DEFAULT_BASE_MANIFEST = Path("content/manifest-base.json")
DEFAULT_LOCK = Path("content/photo-metadata.lock.json")
DEFAULT_PHOTO_DIR = Path("beakspeak/public/content/bird-photos")


class BundledPhotoError(RuntimeError):
    """Raised when bundled photo input or files are invalid."""


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def commons_thumbnail_url(filename: str, width: int) -> str:
    """Return Wikimedia's thumbnail URL for a Commons file at a pixel width."""
    name = filename.replace(" ", "_")
    digest = hashlib.md5(name.encode()).hexdigest()
    quoted = quote(name, safe="")
    return f"{COMMONS_THUMB_ROOT}/{digest[0]}/{digest[:2]}/{quoted}/{width}px-{quoted}"


def parse_srcset(srcset: str) -> list[tuple[str, int]]:
    candidates: list[tuple[str, int]] = []
    for raw in srcset.split(","):
        parts = raw.split()
        if len(parts) != 2 or not re.fullmatch(r"[1-9]\d*w", parts[1]):
            raise BundledPhotoError(f"Invalid srcset candidate: {raw.strip()!r}")
        candidates.append((parts[0], int(parts[1][:-1])))
    return candidates


def expected_photos(base_manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Map each bundled filename to the Commons thumbnail it must contain."""
    expected: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    for species in base_manifest.get("species", []):
        species_id = str(species.get("id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_-]+", species_id) or species_id in seen:
            raise BundledPhotoError(f"Base manifest has a missing or duplicate species ID: {species_id!r}")
        seen.add(species_id)
        photo = species.get("photo") or {}
        context = f"{species_id} photo"
        commons_name = str(photo.get("filename", "")).replace(" ", "_")
        if not commons_name:
            raise BundledPhotoError(f"{context} has no Commons filename")
        extension = Path(commons_name).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise BundledPhotoError(f"{context} has unsupported file type {extension!r}")
        commons_page = str(photo.get("source_url", ""))
        if unquote(commons_page) != COMMONS_FILE_PAGE_PREFIX + commons_name:
            raise BundledPhotoError(f"{context} source_url does not name {commons_name}")

        candidates = parse_srcset(str(photo.get("srcset", "")))
        widths = [width for _, width in candidates]
        if len(set(widths)) != len(widths):
            raise BundledPhotoError(f"{context} srcset repeats a width")
        for url, width in candidates:
            filename = f"{species_id}-{width}{extension}"
            if url != PHOTO_URL_PREFIX + filename:
                raise BundledPhotoError(f"{context} srcset candidate {url} must be {PHOTO_URL_PREFIX}{filename}")
            expected[filename] = {
                "species_id": species_id,
                "width": width,
                "path": url,
                "thumbnail_url": commons_thumbnail_url(commons_name, width),
                "source_url": commons_page,
            }

        largest_url, largest_width = max(candidates, key=lambda candidate: candidate[1])
        if photo.get("url") != largest_url:
            raise BundledPhotoError(f"{context} url must be its largest srcset candidate {largest_url}")
        if photo.get("width") != largest_width:
            raise BundledPhotoError(f"{context} width must match its largest srcset candidate ({largest_width})")
    if not expected:
        raise BundledPhotoError("Base manifest references no photos")
    return expected


def image_size(data: bytes) -> tuple[int, int]:
    """Read pixel dimensions from a JPEG or PNG without decoding it."""
    try:
        return _image_size(data)
    except struct.error as exc:
        # A truncated body ends mid-header; treat it like any other unreadable download.
        raise BundledPhotoError("Downloaded file is a truncated JPEG or PNG image") from exc


def _image_size(data: bytes) -> tuple[int, int]:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 0xFF:
                break
            marker = data[offset + 1]
            if marker == 0xFF:
                offset += 1
                continue
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                offset += 2
                continue
            (length,) = struct.unpack(">H", data[offset + 2:offset + 4])
            # SOF0-SOF15 carry the frame size; C4, C8 and CC are other segment types.
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack(">HH", data[offset + 5:offset + 9])
                return width, height
            offset += 2 + length
    raise BundledPhotoError("Downloaded file is not a readable JPEG or PNG image")


def load_base_manifest(path: str | Path = DEFAULT_BASE_MANIFEST) -> dict[str, Any]:
    path = Path(path)
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise BundledPhotoError(f"Base manifest not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BundledPhotoError(f"Base manifest is invalid JSON: {path}: {exc}") from exc


def load_lock(path: str | Path = DEFAULT_LOCK, *, required: bool = False) -> dict[str, Any]:
    path = Path(path)
    if not path.exists():
        if required:
            raise BundledPhotoError(f"Photo lock not found: {path}; run the photo sync first")
        return {"schema_version": LOCK_SCHEMA_VERSION, "photos": {}}
    try:
        lock = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise BundledPhotoError(f"Photo lock is invalid JSON: {path}: {exc}") from exc
    if lock.get("schema_version") != LOCK_SCHEMA_VERSION or not isinstance(lock.get("photos"), dict):
        raise BundledPhotoError(f"Unsupported photo lock format: {path}")
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


def download_photo(url: str, *, session: Any = requests, attempts: int = 3) -> bytes:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
            response.raise_for_status()
            data = response.content
            image_size(data)
            return data
        except (requests.RequestException, BundledPhotoError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(attempt)
    raise BundledPhotoError(f"Failed to download {url}: {last_error}")


def _owned_files(photo_dir: Path) -> set[str]:
    if not photo_dir.is_dir():
        return set()
    return {path.name for path in photo_dir.iterdir() if path.is_file() and not path.name.startswith(".")}


def sync_photos(
    *,
    base_manifest_path: str | Path = DEFAULT_BASE_MANIFEST,
    lock_path: str | Path = DEFAULT_LOCK,
    photo_dir: str | Path = DEFAULT_PHOTO_DIR,
    force: bool = False,
    session: Any = requests,
) -> dict[str, Any]:
    photo_dir = Path(photo_dir)
    expected = expected_photos(load_base_manifest(base_manifest_path))
    old_photos = load_lock(lock_path).get("photos", {})

    next_photos: dict[str, dict[str, Any]] = {}
    staged: dict[str, bytes] = {}
    reused: list[str] = []
    for filename, wanted in sorted(expected.items()):
        old = old_photos.get(filename)
        path = photo_dir / filename
        if (
            not force
            and old is not None
            and all(old.get(key) == value for key, value in wanted.items())
            and path.is_file()
            and _hash_file(path) == old.get("sha256")
        ):
            next_photos[filename] = old
            reused.append(filename)
            continue

        data = download_photo(wanted["thumbnail_url"], session=session)
        pixel_width, pixel_height = image_size(data)
        if pixel_width != wanted["width"]:
            raise BundledPhotoError(
                f"{wanted['thumbnail_url']} is {pixel_width}px wide, not the {wanted['width']}w its srcset declares"
            )
        staged[filename] = data
        next_photos[filename] = {
            **wanted,
            "pixel_width": pixel_width,
            "pixel_height": pixel_height,
            "bytes": len(data),
            "sha256": _hash_bytes(data),
        }

    # Promote only after every photo has downloaded and validated.
    photo_dir.mkdir(parents=True, exist_ok=True)
    for filename, data in staged.items():
        (photo_dir / filename).write_bytes(data)
    _write_json_atomic(Path(lock_path), {"schema_version": LOCK_SCHEMA_VERSION, "photos": next_photos})

    pruned = sorted(_owned_files(photo_dir) - set(expected))
    for filename in pruned:
        (photo_dir / filename).unlink()

    return {
        "downloaded": sorted(staged),
        "reused": reused,
        "pruned": pruned,
        "total_bytes": sum(entry["bytes"] for entry in next_photos.values()),
    }


def check_photos(
    *,
    base_manifest_path: str | Path = DEFAULT_BASE_MANIFEST,
    lock_path: str | Path = DEFAULT_LOCK,
    photo_dir: str | Path = DEFAULT_PHOTO_DIR,
) -> list[str]:
    try:
        base_manifest = load_base_manifest(base_manifest_path)
        expected = expected_photos(base_manifest)
        photos = load_lock(lock_path, required=True)["photos"]
    except BundledPhotoError as exc:
        return [str(exc)]

    errors: list[str] = []
    photo_dir = Path(photo_dir)
    for filename in sorted(set(photos) - set(expected)):
        errors.append(f"Photo lock contains stale entry {filename}")
    for filename, wanted in sorted(expected.items()):
        locked = photos.get(filename)
        if locked is None:
            errors.append(f"Photo lock is missing {filename}; run the photo sync")
            continue
        if any(locked.get(key) != value for key, value in wanted.items()):
            errors.append(f"Photo lock for {filename} does not match the Commons file in the manifest; run the photo sync")
        if locked.get("pixel_width") != wanted["width"]:
            errors.append(f"{filename} is {locked.get('pixel_width')}px wide, not {wanted['width']}w")
        path = photo_dir / filename
        if not path.is_file():
            errors.append(f"Bundled photo is missing: {path}")
        elif _hash_file(path) != locked.get("sha256"):
            errors.append(f"Bundled photo is modified or stale: {path}")

    for species in base_manifest["species"]:
        photo = species["photo"]
        locked = photos.get(photo["url"].removeprefix(PHOTO_URL_PREFIX), {})
        if locked and photo.get("height") != locked.get("pixel_height"):
            errors.append(f"{species['id']} photo height {photo.get('height')} does not match {locked.get('pixel_height')}px")

    for filename in sorted(_owned_files(photo_dir) - set(expected)):
        errors.append(f"Unreferenced bundled photo: {photo_dir / filename}")
    return errors


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-manifest", default=str(DEFAULT_BASE_MANIFEST))
    parser.add_argument("--lock-file", default=str(DEFAULT_LOCK))
    parser.add_argument("--photo-dir", default=str(DEFAULT_PHOTO_DIR))
    parser.add_argument("--force", action="store_true", help="Download every photo again")
    parser.add_argument("--check", action="store_true", help="Verify bundled photos without network access")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if args.check:
        errors = check_photos(
            base_manifest_path=args.base_manifest,
            lock_path=args.lock_file,
            photo_dir=args.photo_dir,
        )
        if errors:
            for error in errors:
                print(f"Error: {error}", file=sys.stderr)
            return 1
        print("Bundled photos are current.")
        return 0

    try:
        result = sync_photos(
            base_manifest_path=args.base_manifest,
            lock_path=args.lock_file,
            photo_dir=args.photo_dir,
            force=args.force,
        )
    except (BundledPhotoError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Photo sync complete: {len(result['downloaded'])} downloaded, {len(result['reused'])} reused, "
        f"{len(result['pruned'])} pruned; {result['total_bytes'] / 1024:.0f} KiB bundled."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

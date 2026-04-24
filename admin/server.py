#!/usr/bin/env python3
"""
BeakSpeak Admin Server — run from repo root: python3 admin/server.py
Opens at http://localhost:8765
"""

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from populate_content import load_pool_file, normalize_segment_payload, save_pool_file

POOL_FILE = REPO_ROOT / "tier1_seattle_birds_populated.json"
AUDIO_DIR = REPO_ROOT / "beakspeak/public/content/audio"
PHOTO_DIR = REPO_ROOT / "beakspeak/public/content/photos"
ADMIN_DIR = Path(__file__).parent
PORT = 8765
VALID_SELECTED_ROLES = {"none", "song", "call"}


def _find_candidate(data: dict, species_id: str, candidate_id: str, xc_id: str) -> dict | None:
    for sp in data.get("species", []):
        if sp["id"] != species_id:
            continue
        for candidate in sp.get("audio_clips", {}).get("candidates", []):
            matches_candidate_id = candidate_id and str(candidate.get("candidate_id", "")) == candidate_id
            matches_legacy_xc_id = not candidate_id and str(candidate.get("xc_id", "")) == xc_id
            if matches_candidate_id or matches_legacy_xc_id:
                return candidate
        break
    return None


def _manual_segment_payload(start_s: object, end_s: object) -> dict:
    try:
        start = float(start_s)
        end = float(end_s)
    except (TypeError, ValueError) as exc:
        raise ValueError("start_s and end_s must be numeric") from exc

    if start < 0:
        raise ValueError("start_s must be greater than or equal to 0")
    if start >= end:
        raise ValueError("start_s must be less than end_s")

    start = round(start, 3)
    end = round(end, 3)
    return normalize_segment_payload({
        "status": "manual",
        "start_s": start,
        "end_s": end,
        "duration_s": round(end - start, 3),
        "confidence": None,
        "fallback_reason": None,
    })


def persist_candidate_role_assignment(
    *,
    pool_file: str | Path,
    species_id: str,
    candidate_id: str,
    xc_id: str,
    selected_role: str,
) -> dict:
    """Persist one curator-assigned candidate role into the unified pool file."""
    if selected_role not in VALID_SELECTED_ROLES:
        raise ValueError(f"selected_role must be one of {sorted(VALID_SELECTED_ROLES)}")

    data = load_pool_file(pool_file)

    updated_candidate = _find_candidate(data, species_id, candidate_id, xc_id)

    if updated_candidate is None:
        target = candidate_id or xc_id
        raise LookupError(f"clip {target} not found in species {species_id}")

    updated_candidate["selected_role"] = selected_role
    save_pool_file(pool_file, data)
    return updated_candidate


def persist_candidate_segment(
    *,
    pool_file: str | Path,
    species_id: str,
    candidate_id: str,
    xc_id: str,
    start_s: object,
    end_s: object,
) -> dict:
    """Persist a manual trim window for a selected candidate."""
    segment = _manual_segment_payload(start_s, end_s)
    data = load_pool_file(pool_file)
    updated_candidate = _find_candidate(data, species_id, candidate_id, xc_id)

    if updated_candidate is None:
        target = candidate_id or xc_id
        raise LookupError(f"clip {target} not found in species {species_id}")
    if updated_candidate.get("selected_role") not in {"song", "call"}:
        raise ValueError("manual trims can only be saved for selected song or call clips")

    updated_candidate["segment"] = segment
    save_pool_file(pool_file, data)
    return updated_candidate


def reset_candidate_segment(
    *,
    pool_file: str | Path,
    species_id: str,
    candidate_id: str,
    xc_id: str,
) -> dict:
    """Clear a candidate's manual trim window."""
    data = load_pool_file(pool_file)
    updated_candidate = _find_candidate(data, species_id, candidate_id, xc_id)

    if updated_candidate is None:
        target = candidate_id or xc_id
        raise LookupError(f"clip {target} not found in species {species_id}")

    updated_candidate["segment"] = normalize_segment_payload({"status": "not_set"})
    save_pool_file(pool_file, data)
    return updated_candidate


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path):
        if not path.exists():
            self.send_error(404, f"Not found: {path.name}")
            return
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix == ".ogg":
            mime = "audio/ogg"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in ("", "/", "/index.html"):
            self.send_file(ADMIN_DIR / "index.html")

        elif path == "/review-state.mjs":
            self.send_file(ADMIN_DIR / "review-state.mjs")

        elif path == "/clip-evidence.mjs":
            self.send_file(ADMIN_DIR / "clip-evidence.mjs")

        elif path == "/trim-state.mjs":
            self.send_file(ADMIN_DIR / "trim-state.mjs")

        elif path == "/api/pool":
            if not POOL_FILE.exists():
                self.send_json({"error": "tier1_seattle_birds_populated.json not found. Run populate_content.py first."}, 404)
                return
            data = load_pool_file(POOL_FILE)
            self.send_json(data)

        elif path.startswith("/audio/"):
            # /audio/{sid}/{filename}
            parts = path[len("/audio/"):].split("/", 1)
            if len(parts) == 2:
                self.send_file(AUDIO_DIR / parts[0] / parts[1])
            else:
                self.send_error(400)

        elif path.startswith("/photos/"):
            filename = path[len("/photos/"):]
            self.send_file(PHOTO_DIR / filename)

        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/assign-role":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            species_id = body.get("species_id")
            candidate_id = str(body.get("candidate_id", ""))
            xc_id = str(body.get("xc_id", ""))
            selected_role = str(body.get("selected_role", "none"))

            if not POOL_FILE.exists():
                self.send_json({"error": "pool file not found"}, 404)
                return

            try:
                updated_candidate = persist_candidate_role_assignment(
                    pool_file=POOL_FILE,
                    species_id=species_id,
                    candidate_id=candidate_id,
                    xc_id=xc_id,
                    selected_role=selected_role,
                )
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            except LookupError as exc:
                self.send_json({"error": str(exc)}, 404)
                return

            self.send_json({"ok": True, "selected_role": updated_candidate["selected_role"]})

        elif path == "/api/segment":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            species_id = body.get("species_id")
            candidate_id = str(body.get("candidate_id", ""))
            xc_id = str(body.get("xc_id", ""))

            if not POOL_FILE.exists():
                self.send_json({"error": "pool file not found"}, 404)
                return

            try:
                updated_candidate = persist_candidate_segment(
                    pool_file=POOL_FILE,
                    species_id=species_id,
                    candidate_id=candidate_id,
                    xc_id=xc_id,
                    start_s=body.get("start_s"),
                    end_s=body.get("end_s"),
                )
            except ValueError as exc:
                self.send_json({"error": str(exc)}, 400)
                return
            except LookupError as exc:
                self.send_json({"error": str(exc)}, 404)
                return

            self.send_json({"ok": True, "segment": updated_candidate["segment"]})

        elif path == "/api/reset-segment":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            species_id = body.get("species_id")
            candidate_id = str(body.get("candidate_id", ""))
            xc_id = str(body.get("xc_id", ""))

            if not POOL_FILE.exists():
                self.send_json({"error": "pool file not found"}, 404)
                return

            try:
                updated_candidate = reset_candidate_segment(
                    pool_file=POOL_FILE,
                    species_id=species_id,
                    candidate_id=candidate_id,
                    xc_id=xc_id,
                )
            except LookupError as exc:
                self.send_json({"error": str(exc)}, 404)
                return

            self.send_json({"ok": True, "segment": updated_candidate["segment"]})

        else:
            self.send_error(404)


def main():
    if not POOL_FILE.exists():
        print(f"Warning: {POOL_FILE} not found.")
        print("Run `uv run python3 populate_content.py` first to generate the candidate pool.")
        print("Starting server anyway...\n")

    server = HTTPServer(("localhost", PORT), Handler)
    print(f"BeakSpeak Admin — http://localhost:{PORT}")
    print("Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()

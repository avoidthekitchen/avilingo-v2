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
POOL_FILE = REPO_ROOT / "tier1_seattle_birds_populated.json"
AUDIO_DIR = REPO_ROOT / "beakspeak/public/content/audio"
PHOTO_DIR = REPO_ROOT / "beakspeak/public/content/photos"
ADMIN_DIR = Path(__file__).parent
PORT = 8765


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

        elif path == "/api/pool":
            if not POOL_FILE.exists():
                self.send_json({"error": "tier1_seattle_birds_populated.json not found. Run populate_content.py first."}, 404)
                return
            with open(POOL_FILE) as f:
                data = json.load(f)
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

        if path == "/api/toggle":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            species_id = body.get("species_id")
            xc_id = str(body.get("xc_id", ""))
            selected = bool(body.get("selected"))

            if not POOL_FILE.exists():
                self.send_json({"error": "pool file not found"}, 404)
                return

            with open(POOL_FILE) as f:
                data = json.load(f)

            updated = False
            for sp in data.get("species", []):
                if sp["id"] != species_id:
                    continue
                clips = sp.get("audio_clips", {})
                for clip in clips.get("songs", []) + clips.get("calls", []):
                    if str(clip.get("xc_id", "")) == xc_id:
                        clip["selected"] = selected
                        updated = True
                break

            if not updated:
                self.send_json({"error": f"clip {xc_id} not found in species {species_id}"}, 404)
                return

            with open(POOL_FILE, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            self.send_json({"ok": True})

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

"""Helpers for invoking BirdNET from a separate environment.

This keeps avilingo-v2's own environment lean: callers point to an external
`birdnet-analyze` executable instead of installing BirdNET's TensorFlow stack
into this project.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Sequence


class BirdNetNotFoundError(RuntimeError):
    """Raised when no usable birdnet-analyze executable can be resolved."""


def _candidate_paths() -> list[Path]:
    repo_root = Path(__file__).resolve().parent
    sibling_repo = repo_root.parent / "BirdNET-Analyzer"
    candidates = [
        sibling_repo / ".venv" / "bin" / "birdnet-analyze",
        sibling_repo / ".venv" / "Scripts" / "birdnet-analyze.exe",
        repo_root / ".venv" / "bin" / "birdnet-analyze",
        repo_root / ".venv" / "Scripts" / "birdnet-analyze.exe",
    ]
    return candidates


def resolve_birdnet_analyze_bin() -> Path:
    """Resolve the BirdNET CLI executable without importing BirdNET itself.

    Resolution order:
    1. `BIRDNET_ANALYZE_BIN`
    2. `birdnet-analyze` on `PATH`
    3. `BIRDNET_VENV` + platform bin dir
    4. Common sibling `.venv` locations next to this repo
    """
    env_bin = os.environ.get("BIRDNET_ANALYZE_BIN", "").strip()
    if env_bin:
        path = Path(env_bin).expanduser()
        if path.exists():
            return path
        raise BirdNetNotFoundError(f"BIRDNET_ANALYZE_BIN points to a missing file: {path}")

    which_bin = shutil.which("birdnet-analyze")
    if which_bin:
        return Path(which_bin)

    birdnet_venv = os.environ.get("BIRDNET_VENV", "").strip()
    if birdnet_venv:
        venv_root = Path(birdnet_venv).expanduser()
        for rel in ("bin/birdnet-analyze", "Scripts/birdnet-analyze.exe"):
            candidate = venv_root / rel
            if candidate.exists():
                return candidate
        raise BirdNetNotFoundError(f"BIRDNET_VENV is set but no birdnet-analyze executable was found under {venv_root}")

    for candidate in _candidate_paths():
        if candidate.exists():
            return candidate

    raise BirdNetNotFoundError(
        "Could not find birdnet-analyze. Set BIRDNET_ANALYZE_BIN or BIRDNET_VENV, "
        "or activate the BirdNET environment before running this script."
    )


def run_birdnet_analyze(args: Sequence[str], *, check: bool = True, **kwargs) -> subprocess.CompletedProcess[str]:
    """Run BirdNET's CLI as an external process.

    `args` should contain only BirdNET CLI flags and operands, not the executable.
    """
    exe = resolve_birdnet_analyze_bin()
    return subprocess.run([str(exe), *args], check=check, text=True, **kwargs)

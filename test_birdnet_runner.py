from __future__ import annotations

import pytest

import birdnet_runner


def test_resolve_birdnet_analyze_bin_prefers_env_var(monkeypatch, tmp_path):
    exe = tmp_path / "birdnet-analyze"
    exe.write_text("#!/bin/sh\nexit 0\n")
    exe.chmod(0o755)

    monkeypatch.setenv("BIRDNET_ANALYZE_BIN", str(exe))
    monkeypatch.delenv("BIRDNET_VENV", raising=False)
    monkeypatch.setattr(birdnet_runner.shutil, "which", lambda _: None)

    assert birdnet_runner.resolve_birdnet_analyze_bin() == exe


def test_resolve_birdnet_analyze_bin_uses_venv(monkeypatch, tmp_path):
    venv_root = tmp_path / "birdnet-venv"
    exe = venv_root / "bin" / "birdnet-analyze"
    exe.parent.mkdir(parents=True)
    exe.write_text("#!/bin/sh\nexit 0\n")
    exe.chmod(0o755)

    monkeypatch.delenv("BIRDNET_ANALYZE_BIN", raising=False)
    monkeypatch.setenv("BIRDNET_VENV", str(venv_root))
    monkeypatch.setattr(birdnet_runner.shutil, "which", lambda _: None)

    assert birdnet_runner.resolve_birdnet_analyze_bin() == exe


def test_resolve_birdnet_analyze_bin_errors_when_missing(monkeypatch):
    monkeypatch.delenv("BIRDNET_ANALYZE_BIN", raising=False)
    monkeypatch.delenv("BIRDNET_VENV", raising=False)
    monkeypatch.setattr(birdnet_runner.shutil, "which", lambda _: None)
    monkeypatch.setattr(birdnet_runner, "_candidate_paths", lambda: [])

    with pytest.raises(birdnet_runner.BirdNetNotFoundError):
        birdnet_runner.resolve_birdnet_analyze_bin()

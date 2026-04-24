import subprocess
from pathlib import Path

import pytest

from export_app_audio import export_app_audio
from populate_content import save_pool_file


def _candidate(
    *,
    xc_id: str,
    source_role: str = "song",
    selected_role: str = "song",
    commercial_ok: bool = True,
    segment: dict | None = None,
    score: float = 50.0,
    candidate_id: str | None = None,
) -> dict:
    return {
        "candidate_id": candidate_id or f"xc:{xc_id}:{source_role}:0",
        "xc_id": xc_id,
        "source_role": source_role,
        "selected_role": selected_role,
        "type": source_role,
        "xc_type": source_role,
        "audio_url": f"https://xeno-canto.org/{xc_id}.mp3",
        "license": "https://creativecommons.org/licenses/by/4.0/" if commercial_ok else "https://creativecommons.org/licenses/by-nc/4.0/",
        "commercial_ok": commercial_ok,
        "score": score,
        "segment": segment or {"status": "not_set"},
    }


def _pool(candidates: list[dict]) -> dict:
    return {
        "species": [
            {
                "id": "warbler",
                "common_name": "Wilson's Warbler",
                "scientific_name": "Cardellina pusilla",
                "audio_clips": {"schema_version": 2, "candidates": candidates},
                "wikipedia_audio": [],
                "photo": {"url": "/content/photos/warbler.jpg"},
            }
        ]
    }


def test_export_app_audio_generates_manual_trim_from_existing_local_app_audio(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    audio_dir = tmp_path / "audio"
    manifest_out = tmp_path / "manifest.json"
    source = audio_dir / "warbler" / "101.ogg"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"source audio")
    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="101",
                segment={"status": "manual", "start_s": 1.25, "end_s": 6.75, "duration_s": 5.5},
            )
        ]),
    )
    calls = []

    def runner(cmd, capture_output, text):
        del capture_output, text
        calls.append(cmd)
        Path(cmd[-1]).write_bytes(b"trimmed audio")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    result = export_app_audio(
        pool_file=pool_file,
        audio_dir=audio_dir,
        manifest_out=manifest_out,
        force_audio=True,
        runner=runner,
    )

    trimmed = audio_dir / "warbler" / "trimmed" / "xc-101-song-0.ogg"
    assert trimmed.read_bytes() == b"trimmed audio"
    assert source.read_bytes() == b"source audio"
    assert calls == [[
        "ffmpeg",
        "-ss",
        "1.25",
        "-t",
        "5.5",
        "-i",
        str(source),
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-y",
        str(trimmed.with_suffix(".tmp.ogg")),
    ]]
    assert result["generated"] == [trimmed]


def test_export_app_audio_failure_does_not_replace_existing_trimmed_output(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    audio_dir = tmp_path / "audio"
    source = audio_dir / "warbler" / "101.ogg"
    trimmed = audio_dir / "warbler" / "trimmed" / "xc-101-song-0.ogg"
    source.parent.mkdir(parents=True)
    trimmed.parent.mkdir(parents=True)
    source.write_bytes(b"source audio")
    trimmed.write_bytes(b"previous good trim")
    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="101",
                segment={"status": "manual", "start_s": 1.0, "end_s": 3.0, "duration_s": 2.0},
            )
        ]),
    )

    def runner(cmd, capture_output, text):
        del capture_output, text
        Path(cmd[-1]).write_bytes(b"partial")
        return subprocess.CompletedProcess(cmd, 1, "", "boom")

    with pytest.raises(RuntimeError, match="ffmpeg failed"):
        export_app_audio(
            pool_file=pool_file,
            audio_dir=audio_dir,
            manifest_out=tmp_path / "manifest.json",
            force_audio=True,
            runner=runner,
        )

    assert trimmed.read_bytes() == b"previous good trim"
    assert not trimmed.with_suffix(".tmp.ogg").exists()


def test_export_app_audio_missing_manual_trim_source_fails_with_redownload_guidance(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="101",
                segment={"status": "manual", "start_s": 1.0, "end_s": 3.0, "duration_s": 2.0},
            )
        ]),
    )

    with pytest.raises(FileNotFoundError, match="redownload the source audio"):
        export_app_audio(pool_file=pool_file, audio_dir=tmp_path / "audio", manifest_out=tmp_path / "manifest.json")


def test_export_app_audio_skips_existing_trim_without_force_and_warns(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    audio_dir = tmp_path / "audio"
    source = audio_dir / "warbler" / "101.ogg"
    trimmed = audio_dir / "warbler" / "trimmed" / "xc-101-song-0.ogg"
    source.parent.mkdir(parents=True)
    trimmed.parent.mkdir(parents=True)
    source.write_bytes(b"source audio")
    trimmed.write_bytes(b"old trim")
    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="101",
                segment={"status": "manual", "start_s": 1.0, "end_s": 3.0, "duration_s": 2.0},
            )
        ]),
    )

    def runner(cmd, capture_output, text):
        raise AssertionError(f"ffmpeg should not run: {cmd}")

    result = export_app_audio(
        pool_file=pool_file,
        audio_dir=audio_dir,
        manifest_out=tmp_path / "manifest.json",
        force_audio=False,
        runner=runner,
    )

    assert trimmed.read_bytes() == b"old trim"
    assert result["generated"] == []
    assert any("may be stale" in warning for warning in result["warnings"])


def test_export_app_audio_writes_trim_aware_manifest_and_preserves_commercial_substitution(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    audio_dir = tmp_path / "audio"
    manifest_out = tmp_path / "manifest.json"
    for xc_id in ("101", "102", "103"):
        source = audio_dir / "warbler" / f"{xc_id}.ogg"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(f"source {xc_id}".encode())

    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="101",
                selected_role="song",
                commercial_ok=False,
                segment={"status": "manual", "start_s": 1.0, "end_s": 3.0, "duration_s": 2.0},
                score=90.0,
            ),
            _candidate(
                xc_id="102",
                selected_role="none",
                commercial_ok=True,
                score=80.0,
            ),
            _candidate(
                xc_id="103",
                source_role="call",
                selected_role="call",
                commercial_ok=True,
                score=70.0,
            ),
        ]),
    )

    def runner(cmd, capture_output, text):
        del capture_output, text
        Path(cmd[-1]).write_bytes(b"trimmed")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    result = export_app_audio(
        pool_file=pool_file,
        audio_dir=audio_dir,
        manifest_out=manifest_out,
        export_mode="commercial",
        force_audio=True,
        runner=runner,
    )

    manifest = result["manifest"]
    assert [clip["xc_id"] for clip in manifest["species"][0]["audio_clips"]["songs"]] == ["102"]
    assert manifest["species"][0]["audio_clips"]["songs"][0]["audio_url"] == "/content/audio/warbler/102.ogg"
    assert manifest["species"][0]["audio_clips"]["calls"][0]["audio_url"] == "/content/audio/warbler/103.ogg"

    all_mode_result = export_app_audio(
        pool_file=pool_file,
        audio_dir=audio_dir,
        manifest_out=manifest_out,
        export_mode="all",
        force_audio=False,
        runner=runner,
    )
    all_mode_manifest = all_mode_result["manifest"]
    assert all_mode_manifest["species"][0]["audio_clips"]["songs"][0]["audio_url"] == "/content/audio/warbler/trimmed/xc-101-song-0.ogg"


def test_export_app_audio_keys_trimmed_outputs_by_candidate_identity_when_xc_id_is_shared(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    audio_dir = tmp_path / "audio"
    source = audio_dir / "warbler" / "201.ogg"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"source audio")
    save_pool_file(
        pool_file,
        _pool([
            _candidate(
                xc_id="201",
                source_role="song",
                selected_role="song",
                candidate_id="xc:201:song:0",
                segment={"status": "manual", "start_s": 1.0, "end_s": 3.0, "duration_s": 2.0},
            ),
            _candidate(
                xc_id="201",
                source_role="call",
                selected_role="call",
                candidate_id="xc:201:call:0",
                segment={"status": "manual", "start_s": 4.0, "end_s": 6.5, "duration_s": 2.5},
            ),
        ]),
    )
    outputs = []

    def runner(cmd, capture_output, text):
        del capture_output, text
        output = Path(cmd[-1])
        outputs.append(output)
        output.write_bytes(f"trim {cmd[2]} {cmd[4]}".encode())
        return subprocess.CompletedProcess(cmd, 0, "", "")

    result = export_app_audio(
        pool_file=pool_file,
        audio_dir=audio_dir,
        manifest_out=tmp_path / "manifest.json",
        force_audio=True,
        runner=runner,
    )

    song_trim = audio_dir / "warbler" / "trimmed" / "xc-201-song-0.ogg"
    call_trim = audio_dir / "warbler" / "trimmed" / "xc-201-call-0.ogg"
    assert result["generated"] == [song_trim, call_trim]
    assert song_trim.read_bytes() == b"trim 1.0 2.0"
    assert call_trim.read_bytes() == b"trim 4.0 2.5"
    assert outputs == [song_trim.with_suffix(".tmp.ogg"), call_trim.with_suffix(".tmp.ogg")]
    assert result["manifest"]["species"][0]["audio_clips"]["songs"][0]["audio_url"] == "/content/audio/warbler/trimmed/xc-201-song-0.ogg"

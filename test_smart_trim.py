"""Tests for smart trimming in download_media.py.

Uses real ffmpeg to generate test audio files and validates that
detect_best_segment correctly identifies active audio regions.
"""

from copy import deepcopy
import subprocess
import tempfile
from pathlib import Path

import pytest

from download_media import detect_best_segment, normalize_audio, process_species


def make_test_audio(segments: list[tuple[str, float]], path: Path) -> None:
    """Create a test audio file from a list of (type, duration) segments.

    type is either 'silence' or 'tone' (440Hz sine wave).
    Concatenates segments into a single WAV file using ffmpeg.
    """
    if not segments:
        raise ValueError("Need at least one segment")

    filter_parts = []
    for i, (seg_type, duration) in enumerate(segments):
        if seg_type == "silence":
            filter_parts.append(
                f"aevalsrc=0:s=44100:d={duration}[s{i}]"
            )
        elif seg_type == "tone":
            filter_parts.append(
                f"sine=frequency=440:sample_rate=44100:duration={duration}[s{i}]"
            )
        else:
            raise ValueError(f"Unknown segment type: {seg_type}")

    concat_inputs = "".join(f"[s{i}]" for i in range(len(segments)))
    filter_str = ";".join(filter_parts) + f";{concat_inputs}concat=n={len(segments)}:v=0:a=1[out]"

    cmd = [
        "ffmpeg", "-y",
        "-filter_complex", filter_str,
        "-map", "[out]",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")


class TestDetectBestSegment:
    """Integration tests for detect_best_segment using real ffmpeg."""

    def test_leading_silence_returns_segment_after_silence(self, tmp_path):
        """3s silence + 8s tone → should return segment starting near 3s."""
        audio_file = tmp_path / "test.wav"
        make_test_audio([("silence", 3.0), ("tone", 8.0)], audio_file)

        result = detect_best_segment(audio_file)

        assert result is not None
        start, duration = result
        # Start should be near 3s (minus ~0.5s padding, clamped ≥ 0)
        assert 2.0 <= start <= 3.5
        # Duration should cover the tone
        assert duration >= 5.0

    def test_no_silence_returns_none(self, tmp_path):
        """Continuous tone with no silence → returns None (fallback)."""
        audio_file = tmp_path / "test.wav"
        make_test_audio([("tone", 10.0)], audio_file)

        result = detect_best_segment(audio_file)

        assert result is None

    def test_vocalization_between_silence(self, tmp_path):
        """5s silence + 7s tone + 5s silence → returns segment at the tone."""
        audio_file = tmp_path / "test.wav"
        make_test_audio(
            [("silence", 5.0), ("tone", 7.0), ("silence", 5.0)],
            audio_file,
        )

        result = detect_best_segment(audio_file)

        assert result is not None
        start, duration = result
        # Should start near 5.0 (with 0.5s padding → ~4.5)
        assert 4.0 <= start <= 5.5
        # Should cover the 7s tone
        assert duration >= 5.0

    def test_ffmpeg_failure_returns_none(self, tmp_path):
        """Non-existent file → ffmpeg fails → returns None."""
        result = detect_best_segment(tmp_path / "nonexistent.wav")

        assert result is None

    def test_skips_short_segments_picks_first_long_enough(self, tmp_path):
        """Short tone (2s) then silence then long tone (8s) → picks the 8s segment."""
        audio_file = tmp_path / "test.wav"
        make_test_audio(
            [
                ("tone", 2.0),    # too short (< 5s)
                ("silence", 2.0),
                ("tone", 8.0),    # this one qualifies
                ("silence", 1.0),
            ],
            audio_file,
        )

        result = detect_best_segment(audio_file)

        assert result is not None
        start, duration = result
        # Should skip the 2s segment and pick the one starting near 4s
        assert start >= 3.0
        assert duration >= 5.0

    def test_long_segment_capped_at_20s(self, tmp_path):
        """2s silence + 30s tone → duration capped at 20s."""
        audio_file = tmp_path / "test.wav"
        make_test_audio([("silence", 2.0), ("tone", 30.0)], audio_file)

        result = detect_best_segment(audio_file)

        assert result is not None
        start, duration = result
        assert duration <= 20.0

    def test_padding_clamps_to_zero(self, tmp_path):
        """0.2s silence + 8s tone → padding can't go below 0."""
        audio_file = tmp_path / "test.wav"
        make_test_audio([("silence", 0.2), ("tone", 8.0)], audio_file)

        result = detect_best_segment(audio_file)

        # With only 0.2s of silence, the segment starts very early.
        # Even with no silence detected (too short for 0.5s threshold),
        # if a segment is found, start must be >= 0
        if result is not None:
            start, duration = result
            assert start >= 0.0


def get_audio_duration(path: Path) -> float:
    """Get duration of an audio file in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())


class TestNormalizeAudioSmartTrim:
    """Tests that normalize_audio integrates smart trimming."""

    def test_trims_leading_silence(self, tmp_path):
        """5s silence + 10s tone → output should be ~10s, not start with silence."""
        input_file = tmp_path / "input.wav"
        output_file = tmp_path / "output.ogg"
        make_test_audio([("silence", 5.0), ("tone", 10.0)], input_file)

        result = normalize_audio(input_file, output_file)

        assert result is True
        assert output_file.exists()
        dur = get_audio_duration(output_file)
        # Should have trimmed the silence — output should be ~10s, not 15s
        assert dur < 13.0

    def test_fallback_to_first_20s_when_all_active(self, tmp_path):
        """25s continuous tone → no silence → fallback to first 20s."""
        input_file = tmp_path / "input.wav"
        output_file = tmp_path / "output.ogg"
        make_test_audio([("tone", 25.0)], input_file)

        result = normalize_audio(input_file, output_file)

        assert result is True
        dur = get_audio_duration(output_file)
        # Should be capped at ~20s (fallback behavior)
        assert 19.0 <= dur <= 21.0

    def test_uses_persisted_segment_window_without_recomputing_trim(self, tmp_path, monkeypatch):
        """Stored segment windows should be honored directly by downstream export."""
        input_file = tmp_path / "input.wav"
        output_file = tmp_path / "output.ogg"
        make_test_audio([("silence", 5.0), ("tone", 20.0)], input_file)

        def fail_if_called(_input_path):
            raise AssertionError("detect_best_segment should not run when a stored segment is provided")

        monkeypatch.setattr("download_media.detect_best_segment", fail_if_called)

        result = normalize_audio(
            input_file,
            output_file,
            segment={
                "status": "birdnet_target_centered",
                "start_s": 8.0,
                "end_s": 15.0,
                "duration_s": 7.0,
            },
        )

        assert result is True
        dur = get_audio_duration(output_file)
        assert 6.5 <= dur <= 7.5


class TestProcessSpeciesExportSelection:
    def test_all_mode_downloads_all_candidates_for_admin_preview_and_exports_curated_assignments(self, tmp_path, monkeypatch):
        species = {
            "id": "warbler",
            "common_name": "Wilson's Warbler",
            "audio_clips": {
                "schema_version": 2,
                "candidates": [
                    {
                        "candidate_id": "xc:101:song:0",
                        "xc_id": "101",
                        "source_role": "song",
                        "selected_role": "song",
                        "type": "song",
                        "audio_url": "https://example.test/101.mp3",
                        "commercial_ok": True,
                        "segment": {
                            "status": "birdnet_target_centered",
                            "start_s": 3.0,
                            "end_s": 10.0,
                            "duration_s": 7.0,
                            "confidence": 0.92,
                            "fallback_reason": None,
                        },
                    },
                    {
                        "candidate_id": "xc:102:song:1",
                        "xc_id": "102",
                        "source_role": "song",
                        "selected_role": "none",
                        "type": "song",
                        "audio_url": "https://example.test/102.mp3",
                        "commercial_ok": True,
                        "segment": {
                            "status": "birdnet_target_centered",
                            "start_s": 11.0,
                            "end_s": 18.0,
                            "duration_s": 7.0,
                            "confidence": 0.88,
                            "fallback_reason": None,
                        },
                    },
                    {
                        "candidate_id": "xc:103:call:0",
                        "xc_id": "103",
                        "source_role": "call",
                        "selected_role": "call",
                        "type": "call",
                        "audio_url": "https://example.test/103.mp3",
                        "commercial_ok": True,
                        "segment": {
                            "status": "ffmpeg_heuristic",
                            "start_s": 20.0,
                            "end_s": 28.0,
                            "duration_s": 8.0,
                            "confidence": None,
                            "fallback_reason": "birdnet_not_configured",
                        },
                    },
                ],
            },
            "wikipedia_audio": [],
            "photo": {"url": "https://example.test/warbler.jpg"},
        }

        audio_dir = tmp_path / "audio"
        photo_dir = tmp_path / "photos"
        photo_dir.mkdir(parents=True, exist_ok=True)
        (photo_dir / "warbler.jpg").write_bytes(b"photo")
        monkeypatch.setattr("download_media.AUDIO_DIR", audio_dir)
        monkeypatch.setattr("download_media.PHOTO_DIR", photo_dir)

        normalized_calls: list[tuple[str, dict | None]] = []

        def fake_download(url, dest, description=""):
            del description
            dest.write_bytes(url.encode("utf-8"))
            return True

        def fake_normalize(input_path, output_path, segment=None):
            del input_path
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"ogg")
            normalized_calls.append((output_path.name.removesuffix(".ogg"), deepcopy(segment)))
            return True

        monkeypatch.setattr("download_media.download_file", fake_download)
        monkeypatch.setattr("download_media.normalize_audio", fake_normalize)

        manifest_species, export_report = process_species(
            species,
            deepcopy(species),
            export_mode="all",
        )

        assert [xc_id for xc_id, _segment in normalized_calls] == ["101", "102", "103"]
        assert normalized_calls[0][1] == {
            "status": "birdnet_target_centered",
            "start_s": 3.0,
            "end_s": 10.0,
            "duration_s": 7.0,
            "confidence": 0.92,
            "fallback_reason": None,
        }
        assert normalized_calls[1][1] == {
            "status": "birdnet_target_centered",
            "start_s": 11.0,
            "end_s": 18.0,
            "duration_s": 7.0,
            "confidence": 0.88,
            "fallback_reason": None,
        }
        assert normalized_calls[2][1] == {
            "status": "ffmpeg_heuristic",
            "start_s": 20.0,
            "end_s": 28.0,
            "duration_s": 8.0,
            "confidence": None,
            "fallback_reason": "birdnet_not_configured",
        }
        assert [clip["xc_id"] for clip in manifest_species["audio_clips"]["songs"]] == ["101"]
        assert [clip["xc_id"] for clip in manifest_species["audio_clips"]["calls"]] == ["103"]
        assert manifest_species["audio_clips"]["songs"][0]["audio_url"] == "/content/audio/warbler/101.ogg"
        assert manifest_species["audio_clips"]["calls"][0]["audio_url"] == "/content/audio/warbler/103.ogg"
        assert export_report["audio_clips"] == manifest_species["audio_clips"]

    def test_commercial_mode_still_downloads_all_candidates_but_exports_substitute_clip(self, tmp_path, monkeypatch):
        species = {
            "id": "warbler",
            "common_name": "Wilson's Warbler",
            "audio_clips": {
                "schema_version": 2,
                "candidates": [
                    {
                        "candidate_id": "xc:201:song:0",
                        "xc_id": "201",
                        "source_role": "song",
                        "selected_role": "song",
                        "type": "song",
                        "audio_url": "https://example.test/201.mp3",
                        "commercial_ok": False,
                        "score": 90.0,
                        "segment": {
                            "status": "birdnet_target_centered",
                            "start_s": 2.0,
                            "end_s": 9.0,
                            "duration_s": 7.0,
                            "confidence": 0.97,
                            "fallback_reason": None,
                        },
                    },
                    {
                        "candidate_id": "xc:202:song:1",
                        "xc_id": "202",
                        "source_role": "song",
                        "selected_role": "none",
                        "type": "song",
                        "xc_type": "song",
                        "audio_url": "https://example.test/202.mp3",
                        "commercial_ok": True,
                        "score": 70.0,
                        "segment": {
                            "status": "birdnet_extended_context",
                            "start_s": 12.0,
                            "end_s": 21.0,
                            "duration_s": 9.0,
                            "confidence": 0.73,
                            "fallback_reason": "target_region_too_short",
                        },
                    },
                    {
                        "candidate_id": "xc:203:call:0",
                        "xc_id": "203",
                        "source_role": "call",
                        "selected_role": "call",
                        "type": "call",
                        "xc_type": "call",
                        "audio_url": "https://example.test/203.mp3",
                        "commercial_ok": True,
                        "score": 65.0,
                        "segment": {
                            "status": "ffmpeg_heuristic",
                            "start_s": 4.0,
                            "end_s": 12.0,
                            "duration_s": 8.0,
                            "confidence": None,
                            "fallback_reason": "birdnet_not_configured",
                        },
                    },
                ],
            },
            "wikipedia_audio": [],
            "photo": {"url": "https://example.test/warbler.jpg"},
        }

        audio_dir = tmp_path / "audio"
        photo_dir = tmp_path / "photos"
        photo_dir.mkdir(parents=True, exist_ok=True)
        (photo_dir / "warbler.jpg").write_bytes(b"photo")
        monkeypatch.setattr("download_media.AUDIO_DIR", audio_dir)
        monkeypatch.setattr("download_media.PHOTO_DIR", photo_dir)

        normalized_calls: list[tuple[str, dict | None]] = []

        def fake_download(url, dest, description=""):
            del description
            dest.write_bytes(url.encode("utf-8"))
            return True

        def fake_normalize(input_path, output_path, segment=None):
            del input_path
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"ogg")
            normalized_calls.append((output_path.name.removesuffix(".ogg"), deepcopy(segment)))
            return True

        monkeypatch.setattr("download_media.download_file", fake_download)
        monkeypatch.setattr("download_media.normalize_audio", fake_normalize)

        manifest_species, export_report = process_species(
            species,
            deepcopy(species),
            export_mode="commercial",
        )

        assert [xc_id for xc_id, _segment in normalized_calls] == ["201", "202", "203"]
        assert [clip["xc_id"] for clip in manifest_species["audio_clips"]["songs"]] == ["202"]
        assert [clip["xc_id"] for clip in manifest_species["audio_clips"]["calls"]] == ["203"]
        assert export_report["substitutions"] == [
            {
                "role": "song",
                "selected_candidate_id": "xc:201:song:0",
                "selected_xc_id": "201",
                "substitute_candidate_id": "xc:202:song:1",
                "substitute_xc_id": "202",
            }
        ]

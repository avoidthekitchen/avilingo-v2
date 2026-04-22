"""Tests for smart trimming in download_media.py.

Uses real ffmpeg to generate test audio files and validates that
detect_best_segment correctly identifies active audio regions.
"""

import subprocess
import tempfile
from pathlib import Path

import pytest

from download_media import (
    detect_best_segment,
    normalize_audio,
    rewrite_birdnet_csv,
    select_birdnet_segment,
)


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


class TestBirdNetTrimSelection:
    def test_selects_strongest_target_cluster(self):
        rows = [
            {"start": 0.0, "end": 3.0, "common_name": "Target Bird", "scientific_name": "Targetus birdus", "confidence": 0.22, "file": ""},
            {"start": 3.0, "end": 6.0, "common_name": "Other Bird", "scientific_name": "Otherus birdus", "confidence": 0.91, "file": ""},
            {"start": 9.0, "end": 12.0, "common_name": "Target Bird", "scientific_name": "Targetus birdus", "confidence": 0.95, "file": ""},
            {"start": 12.0, "end": 15.0, "common_name": "Target Bird", "scientific_name": "Targetus birdus", "confidence": 0.92, "file": ""},
        ]

        segment = select_birdnet_segment(rows, "Target Bird", "Targetus birdus", 18.0)

        assert segment is not None
        start, duration = segment
        assert 8.0 <= start <= 9.5
        assert duration >= 5.0
        assert start + duration <= 16.0

    def test_returns_none_when_target_not_found(self):
        rows = [
            {"start": 0.0, "end": 3.0, "common_name": "Other Bird", "scientific_name": "Otherus birdus", "confidence": 0.88, "file": ""},
        ]

        assert select_birdnet_segment(rows, "Target Bird", "Targetus birdus", 10.0) is None

    def test_rewrite_birdnet_csv_rebases_trimmed_rows(self, tmp_path):
        csv_path = tmp_path / "clip.BirdNET.results.csv"
        audio_path = tmp_path / "clip.ogg"
        audio_path.write_bytes(b"fake")
        rows = [
            {"start": 0.0, "end": 3.0, "common_name": "Other Bird", "scientific_name": "Otherus birdus", "confidence": 0.33, "file": ""},
            {"start": 3.0, "end": 6.0, "common_name": "Target Bird", "scientific_name": "Targetus birdus", "confidence": 0.95, "file": ""},
            {"start": 6.0, "end": 9.0, "common_name": "Target Bird", "scientific_name": "Targetus birdus", "confidence": 0.91, "file": ""},
        ]

        rewrite_birdnet_csv(csv_path, rows, audio_path, trim_start=2.5, trim_duration=5.5)

        lines = csv_path.read_text().strip().splitlines()
        assert lines[0] == "Start (s),End (s),Scientific name,Common name,Confidence,File"
        assert "0.5,3.5,Targetus birdus,Target Bird,0.9500" in lines[2]
        assert "3.5,5.5,Targetus birdus,Target Bird,0.9100" in lines[3]

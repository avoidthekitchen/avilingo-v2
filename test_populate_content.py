"""Tests for populate_content.py pipeline logic."""

import json
import subprocess
from pathlib import Path

import pytest
from populate_content import (
    analyze_candidates_with_birdnet,
    analyze_audio_with_birdnet,
    attach_candidate_segments,
    build_export_audio_clips,
    build_manifest_audio_clips,
    build_ranked_candidate_pool,
    candidate_quality_warnings,
    count_candidates_by_source_role,
    score_candidate,
    is_commercial_license,
    is_any_cc_license,
    load_pool_file,
    parse_birdnet_csv,
    validate_role_assignments,
    resolve_birdnet_command,
    score_recording,
    select_segment_window,
    format_summary_report,
    normalize_pool_data,
    save_pool_file,
)


class TestLicenseClassification:
    """is_commercial_license accepts CC-BY, CC-BY-SA, CC0 only.
    is_any_cc_license accepts all CC except ND variants."""

    # ── is_commercial_license ─────────────────────────────────

    def test_cc_by_is_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by/4.0/") is True

    def test_cc_by_sa_is_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by-sa/4.0/") is True

    def test_cc0_is_commercial(self):
        assert is_commercial_license("https://creativecommons.org/publicdomain/zero/1.0/") is True

    def test_cc_by_nc_is_not_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by-nc/4.0/") is False

    def test_cc_by_nc_sa_is_not_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by-nc-sa/4.0/") is False

    def test_cc_by_nd_is_not_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by-nd/4.0/") is False

    def test_cc_by_nc_nd_is_not_commercial(self):
        assert is_commercial_license("https://creativecommons.org/licenses/by-nc-nd/4.0/") is False

    def test_empty_url_is_not_commercial(self):
        assert is_commercial_license("") is False

    # ── is_any_cc_license ─────────────────────────────────────

    def test_cc_by_is_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/licenses/by/4.0/") is True

    def test_cc_by_nc_is_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/licenses/by-nc/4.0/") is True

    def test_cc_by_nc_sa_is_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/licenses/by-nc-sa/4.0/") is True

    def test_cc0_is_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/publicdomain/zero/1.0/") is True

    def test_cc_by_nd_is_not_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/licenses/by-nd/4.0/") is False

    def test_cc_by_nc_nd_is_not_any_cc(self):
        assert is_any_cc_license("https://creativecommons.org/licenses/by-nc-nd/4.0/") is False

    def test_empty_url_is_not_any_cc(self):
        assert is_any_cc_license("") is False


def _make_rec(length: str = "0:10", quality: str = "A", loc: str = "", cnt: str = "", rmk: str = "", also: str = "") -> dict:
    """Helper to build a minimal XC recording dict."""
    return {"q": quality, "length": length, "loc": loc, "cnt": cnt, "rmk": rmk, "also": also}


class TestScoreRecording:
    """score_recording uses updated length brackets:
    5-15s→+3, 15-30s→+1, 30-60s→-1, 60s+→-3."""

    def test_10_second_clip_gets_plus_3(self):
        rec = _make_rec(length="0:10", quality="C")  # quality C = +10
        assert score_recording(rec) == 10 + 3  # quality + length

    def test_5_second_boundary_gets_plus_3(self):
        rec = _make_rec(length="0:05", quality="C")
        assert score_recording(rec) == 10 + 3

    def test_15_second_boundary_gets_plus_3(self):
        rec = _make_rec(length="0:15", quality="C")
        assert score_recording(rec) == 10 + 3

    def test_20_second_clip_gets_plus_1(self):
        rec = _make_rec(length="0:20", quality="C")
        assert score_recording(rec) == 10 + 1

    def test_30_second_boundary_gets_plus_1(self):
        rec = _make_rec(length="0:30", quality="C")
        assert score_recording(rec) == 10 + 1

    def test_45_second_clip_gets_minus_1(self):
        rec = _make_rec(length="0:45", quality="C")
        assert score_recording(rec) == 10 + (-1)

    def test_90_second_clip_gets_minus_3(self):
        rec = _make_rec(length="1:30", quality="C")
        assert score_recording(rec) == 10 + (-3)

    def test_4_second_clip_gets_no_length_bonus(self):
        rec = _make_rec(length="0:04", quality="C")
        assert score_recording(rec) == 10  # no length bonus


def _make_xc_rec(
    xc_id: str = "1",
    rec_type: str = "song",
    quality: str = "A",
    length: str = "0:10",
    lic: str = "https://creativecommons.org/licenses/by/4.0/",
    also: str = "",
    loc: str = "",
    cnt: str = "",
    rec_name: str = "Recordist",
    rmk: str = "",
) -> dict:
    """Build a full XC recording dict for integration-style tests."""
    return {
        "id": xc_id,
        "type": rec_type,
        "q": quality,
        "length": length,
        "lic": lic,
        "also": also,
        "loc": loc,
        "cnt": cnt,
        "rec": rec_name,
        "rmk": rmk,
        "file": f"https://xeno-canto.org/sounds/{xc_id}.mp3",
    }


CC_BY = "https://creativecommons.org/licenses/by/4.0/"
CC_BY_NC = "https://creativecommons.org/licenses/by-nc/4.0/"


class TestUnifiedCandidateRanking:
    def test_builds_one_mixed_ranked_candidate_pool(self):
        recs = [
            _make_xc_rec(xc_id="10", rec_type="song", quality="A", length="0:09", lic=CC_BY, rmk="clean primary bird"),
            _make_xc_rec(xc_id="11", rec_type="call", quality="A", length="0:07", lic=CC_BY),
            _make_xc_rec(xc_id="12", rec_type="song, call", quality="B", length="0:08", lic=CC_BY_NC),
        ]

        result = build_ranked_candidate_pool(recs, species_name="TestSpecies")

        assert "candidates" in result
        assert "songs" not in result
        assert "calls" not in result
        assert [candidate["xc_id"] for candidate in result["candidates"]] == ["10", "11", "12"]
        assert [candidate["rank"] for candidate in result["candidates"]] == [1, 2, 3]
        assert result["source_role_counts"] == {"song": 2, "call": 1}

    def test_preserves_original_xc_type_metadata_for_admin_review(self):
        result = build_ranked_candidate_pool(
            [_make_xc_rec(xc_id="22", rec_type="call, song", quality="A", length="0:08")],
            species_name="TestSpecies",
        )

        candidate = result["candidates"][0]
        assert candidate["type"] == "call, song"
        assert candidate["xc_type"] == "call, song"
        assert candidate["xc_types"] == ["call", "song"]

    def test_also_metadata_materially_lowers_ranking_without_dropping_candidate(self):
        clean = normalize_pool_data({
            "species": [{
                "id": "test",
                "audio_clips": {
                    "candidates": [
                        {
                            "candidate_id": "xc:31:song:0",
                            "xc_id": "31",
                            "source_role": "song",
                            "selected_role": "none",
                            "type": "song",
                            "quality": "A",
                            "length": "0:08",
                            "license": CC_BY,
                            "commercial_ok": True,
                            "also": "",
                            "analysis": {"status": "not_analyzed"},
                        },
                        {
                            "candidate_id": "xc:32:song:1",
                            "xc_id": "32",
                            "source_role": "song",
                            "selected_role": "none",
                            "type": "song",
                            "quality": "A",
                            "length": "0:08",
                            "license": CC_BY,
                            "commercial_ok": True,
                            "also": "Steller's Jay",
                            "analysis": {"status": "not_analyzed"},
                        },
                    ],
                },
            }],
        })["species"][0]["audio_clips"]["candidates"]

        ranked = sorted(clean, key=score_candidate, reverse=True)

        assert [candidate["xc_id"] for candidate in ranked] == ["31", "32"]
        assert score_candidate(ranked[0]) > score_candidate(ranked[1])

    def test_birdnet_signals_improve_rank_when_available(self):
        candidates = normalize_pool_data({
            "species": [{
                "id": "test",
                "audio_clips": {
                    "candidates": [
                        {
                            "candidate_id": "xc:41:song:0",
                            "xc_id": "41",
                            "source_role": "song",
                            "selected_role": "none",
                            "type": "song",
                            "quality": "B",
                            "length": "0:09",
                            "license": CC_BY,
                            "commercial_ok": True,
                            "analysis": {
                                "status": "ok",
                                "summary": {
                                    "max_target_confidence": 0.95,
                                    "overlap_detection_count": 0,
                                },
                            },
                        },
                        {
                            "candidate_id": "xc:42:song:1",
                            "xc_id": "42",
                            "source_role": "song",
                            "selected_role": "none",
                            "type": "song",
                            "quality": "A",
                            "length": "0:09",
                            "license": CC_BY,
                            "commercial_ok": True,
                            "analysis": {
                                "status": "ok",
                                "summary": {
                                    "max_target_confidence": 0.15,
                                    "overlap_detection_count": 3,
                                },
                            },
                        },
                    ],
                },
            }],
        })["species"][0]["audio_clips"]["candidates"]

        ranked = sorted(candidates, key=score_candidate, reverse=True)

        assert [candidate["xc_id"] for candidate in ranked] == ["41", "42"]

    def test_missing_birdnet_data_keeps_candidate_rankable_with_degraded_status(self):
        result = build_ranked_candidate_pool(
            [_make_xc_rec(xc_id="51", rec_type="call", quality="B", lic=CC_BY_NC)],
            species_name="TestSpecies",
        )

        candidate = result["candidates"][0]
        assert candidate["analysis"]["status"] == "not_analyzed"
        assert result["degraded_analysis_count"] == 1
        assert "analysis unavailable" in result["quality_warnings"][0].lower()

    def test_candidate_quality_warnings_flag_sparse_pool_and_noisy_top_results(self):
        result = build_ranked_candidate_pool(
            [
                _make_xc_rec(xc_id="61", rec_type="song", quality="A", lic=CC_BY),
                _make_xc_rec(xc_id="62", rec_type="call", quality="B", lic=CC_BY_NC, also="Steller's Jay"),
            ],
            species_name="TestSpecies",
        )

        warnings = result["quality_warnings"]
        assert any("only 2 ranked candidate(s)" in warning.lower() for warning in warnings)
        assert any("background-species metadata" in warning.lower() for warning in warnings)

    def test_count_candidates_by_source_role_reports_mixed_pool_shape(self):
        counts = count_candidates_by_source_role([
            {"source_role": "song"},
            {"source_role": "call"},
            {"source_role": "song"},
        ])
        assert counts == {"song": 2, "call": 1}


class TestSummaryReport:
    """format_summary_report produces a human-readable summary of pipeline results."""

    def _make_species_results(self):
        """Build sample species results for summary testing."""
        return [
            {
                "name": "American Robin",
                "candidate_count": 5,
                "source_role_counts": {"song": 3, "call": 2},
                "commercial_clips": 5,
                "nc_clips": 0,
                "quality_warnings": [],
                "degraded_analysis_count": 0,
            },
            {
                "name": "Dark-eyed Junco",
                "candidate_count": 2,
                "source_role_counts": {"song": 1, "call": 1},
                "commercial_clips": 1,
                "nc_clips": 1,
                "quality_warnings": [
                    "Only 2 ranked candidate(s) available after filtering; manual review will be sparse.",
                ],
                "degraded_analysis_count": 2,
            },
            {
                "name": "Song Sparrow",
                "candidate_count": 5,
                "source_role_counts": {"song": 4, "call": 1},
                "commercial_clips": 3,
                "nc_clips": 2,
                "quality_warnings": [
                    "Top-ranked candidates still include background-species metadata; manual review should listen closely.",
                ],
                "degraded_analysis_count": 0,
            },
        ]

    def test_report_contains_species_with_noncommercial_candidates(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        assert "Dark-eyed Junco" in report
        assert "Song Sparrow" in report

    def test_report_contains_sparse_candidate_pool_species(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        assert "Dark-eyed Junco" in report

    def test_report_contains_commercial_vs_nc_totals(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        # Total: 9 commercial, 3 NC = 12 total
        assert "9" in report  # commercial count
        assert "3" in report  # NC count

    def test_report_no_noncommercial_candidates_when_all_commercial(self):
        results = [
            {
                "name": "Robin",
                "candidate_count": 5,
                "source_role_counts": {"song": 3, "call": 2},
                "commercial_clips": 5,
                "nc_clips": 0,
                "quality_warnings": [],
                "degraded_analysis_count": 0,
            },
        ]
        report = format_summary_report(results)
        assert "No species required non-commercial candidates" in report

    def test_report_no_sparse_mixed_pool_when_all_species_have_depth(self):
        results = [
            {
                "name": "Robin",
                "candidate_count": 5,
                "source_role_counts": {"song": 3, "call": 2},
                "commercial_clips": 5,
                "nc_clips": 0,
                "quality_warnings": [],
                "degraded_analysis_count": 0,
            },
        ]
        report = format_summary_report(results)
        assert "All species have at least 4 ranked candidates" in report

    def test_report_distinguishes_birdnet_assisted_from_ffmpeg_only_fallback(self):
        results = [
            {
                "name": "American Robin",
                "candidate_count": 5,
                "source_role_counts": {"song": 3, "call": 2},
                "commercial_clips": 5,
                "nc_clips": 0,
                "quality_warnings": [],
                "degraded_analysis_count": 0,
                "birdnet_status": "birdnet_assisted",
                "birdnet_ok_candidates": 5,
                "birdnet_fallback_candidates": 0,
            },
            {
                "name": "Dark-eyed Junco",
                "candidate_count": 3,
                "source_role_counts": {"song": 2, "call": 1},
                "commercial_clips": 3,
                "nc_clips": 0,
                "quality_warnings": [],
                "degraded_analysis_count": 3,
                "birdnet_status": "ffmpeg_only_fallback",
                "birdnet_ok_candidates": 0,
                "birdnet_fallback_candidates": 3,
                "birdnet_warning": "WARNING: BirdNET unavailable; using FFmpeg-only fallback. BirdNET is not configured.",
            },
        ]

        report = format_summary_report(results)

        assert "BirdNET-assisted species" in report
        assert "American Robin: 5 analyzed, 0 fallback" in report
        assert "FFmpeg-only fallback species" in report
        assert "Dark-eyed Junco: 0 analyzed, 3 fallback" in report

    def test_report_contains_quality_gap_and_degraded_analysis_sections(self):
        report = format_summary_report(self._make_species_results())

        assert "Mixed-pool quality gaps" in report
        assert "BirdNET degraded-analysis species" in report


class TestBirdNETAdapter:
    def test_resolve_birdnet_command_autodetects_default_local_install(self, monkeypatch):
        monkeypatch.setattr("populate_content.shutil.which", lambda command: None)

        class FakeHomePath(Path.home().__class__):
            _home_path = Path("/Users/mistercheese")

            @classmethod
            def home(cls):
                return cls(cls._home_path)

        def fake_exists(path_self):
            return str(path_self) == "/Users/mistercheese/Code/BirdNET-Analyzer/.venv/bin/birdnet-analyze"

        monkeypatch.setattr("populate_content.Path", FakeHomePath)
        monkeypatch.setattr(FakeHomePath, "exists", fake_exists, raising=False)

        command, failure = resolve_birdnet_command(env={})

        assert command == ["/Users/mistercheese/Code/BirdNET-Analyzer/.venv/bin/birdnet-analyze"]
        assert failure is None

    def test_parse_birdnet_csv_separates_target_and_overlap_detections(self):
        csv_text = "\n".join([
            "Start (s),End (s),Scientific name,Common name,Confidence,File",
            "0.0,3.0,Turdus migratorius,American Robin,0.91,/tmp/robin.wav",
            "3.0,6.0,Cyanocitta stelleri,Steller's Jay,0.42,/tmp/robin.wav",
            "6.0,9.0,Turdus migratorius,American Robin,0.87,/tmp/robin.wav",
        ])

        analysis = parse_birdnet_csv(
            csv_text,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
        )

        assert analysis["status"] == "ok"
        assert analysis["provider"] == "birdnet"
        assert [d["confidence"] for d in analysis["target_detections"]] == [0.91, 0.87]
        assert [d["common_name"] for d in analysis["overlap_detections"]] == ["Steller's Jay"]
        assert analysis["summary"] == {
            "target_detection_count": 2,
            "overlap_detection_count": 1,
            "max_target_confidence": 0.91,
            "top_overlap_species": ["Steller's Jay"],
        }

    def test_invalid_birdnet_executable_returns_fallback_status(self, tmp_path):
        audio_path = tmp_path / "robin.wav"
        audio_path.write_bytes(b"fake wav")

        analysis = analyze_audio_with_birdnet(
            audio_path,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
            env={"BIRDNET_COMMAND": str(tmp_path / "missing-birdnet")},
        )

        assert analysis["status"] == "unavailable"
        assert analysis["provider"] == "birdnet"
        assert analysis["target_detections"] == []
        assert analysis["overlap_detections"] == []
        assert analysis["failure"] == {
            "code": "birdnet_executable_not_found",
            "message": f"BirdNET executable not found: {tmp_path / 'missing-birdnet'}",
        }

    def test_birdnet_runner_parses_csv_results_into_analysis_payload(self, tmp_path):
        audio_path = tmp_path / "robin.wav"
        audio_path.write_bytes(b"fake wav")
        birdnet_path = tmp_path / "birdnet-analyze"
        birdnet_path.write_text("#!/bin/sh\n")
        birdnet_path.chmod(0o755)

        def fake_runner(cmd, capture_output, text, timeout, check):
            output_dir = Path(cmd[cmd.index("-o") + 1])
            output_dir.mkdir(parents=True, exist_ok=True)
            result_path = output_dir / "robin.BirdNET.results.csv"
            result_path.write_text("\n".join([
                "Start (s),End (s),Scientific name,Common name,Confidence,File",
                "0.0,3.0,Turdus migratorius,American Robin,0.91,/tmp/robin.wav",
                "3.0,6.0,Cyanocitta stelleri,Steller's Jay,0.42,/tmp/robin.wav",
            ]))
            return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

        analysis = analyze_audio_with_birdnet(
            audio_path,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
            env={"BIRDNET_COMMAND": str(birdnet_path)},
            runner=fake_runner,
        )

        assert analysis["status"] == "ok"
        assert [d["common_name"] for d in analysis["target_detections"]] == ["American Robin"]
        assert [d["common_name"] for d in analysis["overlap_detections"]] == ["Steller's Jay"]

    def test_malformed_birdnet_output_returns_parse_failed_status(self, tmp_path):
        audio_path = tmp_path / "robin.wav"
        audio_path.write_bytes(b"fake wav")
        birdnet_path = tmp_path / "birdnet-analyze"
        birdnet_path.write_text("#!/bin/sh\n")
        birdnet_path.chmod(0o755)

        def fake_runner(cmd, capture_output, text, timeout, check):
            output_dir = Path(cmd[cmd.index("-o") + 1])
            output_dir.mkdir(parents=True, exist_ok=True)
            result_path = output_dir / "robin.BirdNET.results.csv"
            result_path.write_text("\n".join([
                "Start (s),End (s),Common name,Confidence,File",
                "0.0,3.0,American Robin,0.91,/tmp/robin.wav",
            ]))
            return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

        analysis = analyze_audio_with_birdnet(
            audio_path,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
            env={"BIRDNET_COMMAND": str(birdnet_path)},
            runner=fake_runner,
        )

        assert analysis["status"] == "parse_failed"
        assert analysis["failure"] == {
            "code": "birdnet_parse_failed",
            "message": "missing required columns: Scientific name",
        }

    def test_candidate_analysis_is_stored_back_into_candidate_pool(self, tmp_path):
        audio_path = tmp_path / "robin.wav"
        audio_path.write_bytes(b"fake wav")
        birdnet_path = tmp_path / "birdnet-analyze"
        birdnet_path.write_text("#!/bin/sh\n")
        birdnet_path.chmod(0o755)
        candidates = [{"candidate_id": "xc:101:song:0", "audio_url": "https://example.test/101.mp3"}]

        def fake_runner(cmd, capture_output, text, timeout, check):
            output_dir = Path(cmd[cmd.index("-o") + 1])
            output_dir.mkdir(parents=True, exist_ok=True)
            result_path = output_dir / "robin.BirdNET.results.csv"
            result_path.write_text("\n".join([
                "Start (s),End (s),Scientific name,Common name,Confidence,File",
                "0.0,3.0,Turdus migratorius,American Robin,0.91,/tmp/robin.wav",
            ]))
            return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

        report = analyze_candidates_with_birdnet(
            candidates,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
            env={"BIRDNET_COMMAND": str(birdnet_path)},
            runner=fake_runner,
            downloader=lambda candidate: audio_path,
        )

        assert candidates[0]["analysis"]["status"] == "ok"
        assert candidates[0]["analysis"]["target_detections"][0]["common_name"] == "American Robin"
        assert report == {
            "status": "birdnet_assisted",
            "ok_candidates": 1,
            "fallback_candidates": 0,
            "warning": None,
        }

    def test_missing_birdnet_config_marks_candidates_unavailable_with_warning(self, monkeypatch):
        candidates = [{"candidate_id": "xc:101:song:0", "audio_url": "https://example.test/101.mp3"}]
        monkeypatch.setattr("populate_content.shutil.which", lambda command: None)

        class FakeHomePath(Path.home().__class__):
            _home_path = Path("/tmp/no-birdnet-home")

            @classmethod
            def home(cls):
                return cls(cls._home_path)

        monkeypatch.setattr("populate_content.Path", FakeHomePath)

        report = analyze_candidates_with_birdnet(
            candidates,
            target_common_name="American Robin",
            target_scientific_name="Turdus migratorius",
            env={},
        )

        assert candidates[0]["analysis"]["status"] == "unavailable"
        assert candidates[0]["analysis"]["failure"] == {
            "code": "birdnet_not_configured",
            "message": (
                "BirdNET is not configured. Set BIRDNET_COMMAND or BIRDNET_HOME, install birdnet-analyze on PATH, "
                "or place BirdNET-Analyzer at ~/Code/BirdNET-Analyzer."
            ),
        }
        assert report == {
            "status": "ffmpeg_only_fallback",
            "ok_candidates": 0,
            "fallback_candidates": 1,
            "warning": (
                "WARNING: BirdNET unavailable; using FFmpeg-only fallback. "
                "BirdNET is not configured. Set BIRDNET_COMMAND or BIRDNET_HOME, install birdnet-analyze on PATH, "
                "or place BirdNET-Analyzer at ~/Code/BirdNET-Analyzer."
            ),
        }


class TestSegmentSelection:
    def test_birdnet_target_detections_choose_preferred_centered_window(self):
        candidate = {
            "analysis": {
                "status": "ok",
                "target_detections": [
                    {
                        "start_s": 10.0,
                        "end_s": 12.0,
                        "confidence": 0.96,
                        "scientific_name": "Turdus migratorius",
                        "common_name": "American Robin",
                    }
                ],
                "overlap_detections": [],
                "summary": {"max_target_confidence": 0.96},
                "failure": None,
            }
        }

        segment = select_segment_window(candidate, audio_duration_s=30.0)

        assert segment["status"] == "birdnet_target_centered"
        assert segment["fallback_reason"] is None
        assert segment["confidence"] == pytest.approx(0.96)
        assert segment["duration_s"] == pytest.approx(7.0)
        assert segment["start_s"] == pytest.approx(7.5)
        assert segment["end_s"] == pytest.approx(14.5)

    def test_long_target_region_extends_window_and_records_fallback_reason(self):
        candidate = {
            "analysis": {
                "status": "ok",
                "target_detections": [
                    {
                        "start_s": 5.0,
                        "end_s": 13.5,
                        "confidence": 0.91,
                        "scientific_name": "Turdus migratorius",
                        "common_name": "American Robin",
                    }
                ],
                "overlap_detections": [],
                "summary": {"max_target_confidence": 0.91},
                "failure": None,
            }
        }

        segment = select_segment_window(candidate, audio_duration_s=30.0)

        assert segment["status"] == "birdnet_extended_context"
        assert segment["fallback_reason"] == "target_region_requires_more_context"
        assert 8.0 < segment["duration_s"] <= 12.0
        assert segment["start_s"] <= 5.0
        assert segment["end_s"] >= 13.5

    def test_missing_birdnet_analysis_falls_back_to_ffmpeg_active_region(self):
        candidate = {
            "analysis": {
                "status": "unavailable",
                "provider": "birdnet",
                "target_detections": [],
                "overlap_detections": [],
                "summary": None,
                "failure": {
                    "code": "birdnet_not_configured",
                    "message": "BirdNET not configured",
                },
            }
        }

        segment = select_segment_window(
            candidate,
            audio_duration_s=40.0,
            active_regions=[(15.0, 25.0)],
        )

        assert segment["status"] == "ffmpeg_heuristic"
        assert segment["fallback_reason"] == "birdnet_not_configured"
        assert segment["duration_s"] == pytest.approx(7.0)
        assert segment["start_s"] == pytest.approx(16.5)
        assert segment["end_s"] == pytest.approx(23.5)

    def test_segment_selection_is_persisted_back_onto_candidates(self, tmp_path, monkeypatch):
        audio_path = tmp_path / "robin.wav"
        audio_path.write_bytes(b"fake wav")
        candidates = [
            {
                "candidate_id": "xc:101:song:0",
                "audio_url": "https://example.test/101.mp3",
                "analysis": {
                    "status": "unavailable",
                    "provider": "birdnet",
                    "target_detections": [],
                    "overlap_detections": [],
                    "summary": None,
                    "failure": {
                        "code": "birdnet_not_configured",
                        "message": "BirdNET not configured",
                    },
                },
            }
        ]

        monkeypatch.setattr("populate_content.probe_audio_duration", lambda _path, runner=None: 40.0)
        monkeypatch.setattr("populate_content.detect_active_regions", lambda _path, runner=None: [(15.0, 25.0)])

        summary = attach_candidate_segments(
            candidates,
            downloader=lambda candidate: audio_path,
        )

        assert candidates[0]["segment"]["status"] == "ffmpeg_heuristic"
        assert candidates[0]["segment"]["fallback_reason"] == "birdnet_not_configured"
        assert summary == {
            "birdnet_target_centered": 0,
            "birdnet_extended_context": 0,
            "ffmpeg_fallback": 1,
        }


class TestPoolSchemaNormalization:
    def test_old_style_audio_clips_normalize_to_unified_candidates(self):
        pool = {
            "species": [
                {
                    "id": "robin",
                    "common_name": "American Robin",
                    "audio_clips": {
                        "songs": [
                            {
                                "xc_id": "101",
                                "xc_url": "https://xeno-canto.org/101",
                                "audio_url": "https://xeno-canto.org/101.mp3",
                                "type": "song",
                                "quality": "A",
                                "length": "0:12",
                                "recordist": "Alice",
                                "license": CC_BY,
                                "location": "Seattle",
                                "country": "United States",
                                "score": 58.4,
                                "commercial_ok": True,
                                "selected": True,
                            },
                            {
                                "xc_id": "202",
                                "xc_url": "https://xeno-canto.org/202",
                                "audio_url": "https://xeno-canto.org/202.mp3",
                                "type": "song, call",
                                "quality": "B",
                                "length": "0:08",
                                "recordist": "Bob",
                                "license": CC_BY_NC,
                                "location": "Portland",
                                "country": "United States",
                                "score": 39.2,
                                "commercial_ok": False,
                                "selected": False,
                            },
                        ],
                        "calls": [
                            {
                                "xc_id": "202",
                                "xc_url": "https://xeno-canto.org/202",
                                "audio_url": "https://xeno-canto.org/202.mp3",
                                "type": "song, call",
                                "quality": "B",
                                "length": "0:08",
                                "recordist": "Bob",
                                "license": CC_BY_NC,
                                "location": "Portland",
                                "country": "United States",
                                "score": 39.2,
                                "commercial_ok": False,
                                "selected": True,
                            }
                        ],
                    },
                }
            ]
        }

        normalized = normalize_pool_data(pool)

        clips = normalized["species"][0]["audio_clips"]
        assert normalized["schema_version"] == 2
        assert clips["schema_version"] == 2
        assert "candidates" in clips
        assert "songs" not in clips
        assert "calls" not in clips

        candidates = clips["candidates"]
        assert [candidate["candidate_id"] for candidate in candidates] == [
            "xc:101:song:0",
            "xc:202:song:1",
            "xc:202:call:0",
        ]
        assert [candidate["xc_id"] for candidate in candidates] == ["101", "202", "202"]
        assert [candidate["source_role"] for candidate in candidates] == ["song", "song", "call"]
        assert [candidate["selected_role"] for candidate in candidates] == ["song", "none", "call"]

        assert candidates[0]["license"] == CC_BY
        assert candidates[1]["license"] == CC_BY_NC
        assert candidates[1]["commercial_ok"] is False

    def test_new_style_candidates_default_missing_analysis_and_segment_fields(self):
        pool = {
            "schema_version": 2,
            "species": [
                {
                    "id": "wren",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:303:song:0",
                                "xc_id": "303",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                            }
                        ],
                    },
                }
            ],
        }

        normalized = normalize_pool_data(pool)
        candidate = normalized["species"][0]["audio_clips"]["candidates"][0]

        assert candidate["analysis"]["status"] == "not_analyzed"
        assert candidate["analysis"]["target_detections"] == []
        assert candidate["analysis"]["overlap_detections"] == []
        assert candidate["segment"]["status"] == "not_set"
        assert candidate["segment"]["start_s"] is None
        assert candidate["segment"]["end_s"] is None

    def test_round_trip_file_save_rewrites_old_pool_in_new_schema(self, tmp_path):
        pool_path = tmp_path / "pool.json"
        pool_path.write_text(json.dumps({
            "species": [
                {
                    "id": "sparrow",
                    "audio_clips": {
                        "songs": [
                            {
                                "xc_id": "404",
                                "xc_url": "https://xeno-canto.org/404",
                                "audio_url": "https://xeno-canto.org/404.mp3",
                                "type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "selected": True,
                            }
                        ],
                        "calls": [],
                    },
                }
            ]
        }))

        normalized = load_pool_file(pool_path)
        save_pool_file(pool_path, normalized)
        rewritten = json.loads(pool_path.read_text())
        candidate = rewritten["species"][0]["audio_clips"]["candidates"][0]

        assert rewritten["schema_version"] == 2
        assert "songs" not in rewritten["species"][0]["audio_clips"]
        assert candidate["candidate_id"] == "xc:404:song:0"
        assert candidate["selected_role"] == "song"
        assert candidate["analysis"]["status"] == "not_analyzed"

    def test_selected_roles_project_back_to_manifest_songs_and_calls(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "finch",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:505:song:0",
                                "xc_id": "505",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                            },
                            {
                                "candidate_id": "xc:606:call:0",
                                "xc_id": "606",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "license": CC_BY_NC,
                                "commercial_ok": False,
                            },
                            {
                                "candidate_id": "xc:707:song:1",
                                "xc_id": "707",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                            },
                        ],
                    },
                }
            ],
        })

        manifest_audio = build_manifest_audio_clips(normalized["species"][0]["audio_clips"])

        assert [clip["xc_id"] for clip in manifest_audio["songs"]] == ["505"]
        assert [clip["xc_id"] for clip in manifest_audio["calls"]] == ["606"]
        assert manifest_audio["songs"][0]["type"] == "song"
        assert manifest_audio["calls"][0]["commercial_ok"] is False


class TestExportModes:
    def test_all_mode_preserves_selected_noncommercial_clips(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "warbler",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:801:song:0",
                                "xc_id": "801",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "license": CC_BY_NC,
                                "commercial_ok": False,
                                "score": 72.0,
                            },
                            {
                                "candidate_id": "xc:802:song:1",
                                "xc_id": "802",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 54.0,
                            },
                            {
                                "candidate_id": "xc:803:call:0",
                                "xc_id": "803",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 50.0,
                            },
                        ],
                    },
                }
            ],
        })

        manifest_audio = build_manifest_audio_clips(
            normalized["species"][0]["audio_clips"],
            export_mode="all",
        )

        assert [clip["xc_id"] for clip in manifest_audio["songs"]] == ["801"]
        assert [clip["xc_id"] for clip in manifest_audio["calls"]] == ["803"]

    def test_commercial_mode_substitutes_best_commercial_candidate_for_nc_selection(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "warbler",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:801:song:0",
                                "xc_id": "801",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY_NC,
                                "commercial_ok": False,
                                "score": 72.0,
                            },
                            {
                                "candidate_id": "xc:802:song:1",
                                "xc_id": "802",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 54.0,
                            },
                            {
                                "candidate_id": "xc:803:song:2",
                                "xc_id": "803",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 41.0,
                            },
                            {
                                "candidate_id": "xc:804:call:0",
                                "xc_id": "804",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "xc_type": "call",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 50.0,
                            },
                        ],
                    },
                }
            ],
        })

        export_report = build_export_audio_clips(
            normalized["species"][0]["audio_clips"],
            export_mode="commercial",
        )

        assert [clip["xc_id"] for clip in export_report["audio_clips"]["songs"]] == ["802"]
        assert [clip["xc_id"] for clip in export_report["audio_clips"]["calls"]] == ["804"]
        assert export_report["substitutions"] == [
            {
                "role": "song",
                "selected_candidate_id": "xc:801:song:0",
                "selected_xc_id": "801",
                "substitute_candidate_id": "xc:802:song:1",
                "substitute_xc_id": "802",
            }
        ]
        assert any("quality tradeoff" in warning.lower() for warning in export_report["warnings"])

    def test_commercial_mode_warns_when_no_commercial_replacement_exists(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "warbler",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:811:song:0",
                                "xc_id": "811",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY_NC,
                                "commercial_ok": False,
                                "score": 72.0,
                            },
                            {
                                "candidate_id": "xc:812:call:0",
                                "xc_id": "812",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "xc_type": "call",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 50.0,
                            },
                        ],
                    },
                }
            ],
        })

        export_report = build_export_audio_clips(
            normalized["species"][0]["audio_clips"],
            export_mode="commercial",
        )

        assert export_report["audio_clips"]["songs"] == []
        assert [clip["xc_id"] for clip in export_report["audio_clips"]["calls"]] == ["812"]
        assert export_report["substitutions"] == []
        assert any("no commercial-compatible replacement" in warning.lower() for warning in export_report["warnings"])

    def test_validator_reports_sparse_roles_and_substitution_opportunities(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "warbler",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:821:song:0",
                                "xc_id": "821",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY_NC,
                                "commercial_ok": False,
                                "score": 72.0,
                            },
                            {
                                "candidate_id": "xc:822:song:1",
                                "xc_id": "822",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                                "xc_type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 54.0,
                            },
                            {
                                "candidate_id": "xc:823:call:0",
                                "xc_id": "823",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "xc_type": "call",
                                "license": CC_BY,
                                "commercial_ok": True,
                                "score": 50.0,
                            },
                        ],
                    },
                }
            ],
        })

        validator = validate_role_assignments(
            normalized["species"][0]["audio_clips"],
            export_mode="commercial",
        )

        assert validator["counts"] == {"song": 1, "call": 1}
        assert any("below the target depth of 2" in warning.lower() for warning in validator["warnings"])
        assert validator["substitution_opportunities"] == [
            {
                "role": "song",
                "selected_candidate_id": "xc:821:song:0",
                "selected_xc_id": "821",
                "substitute_candidate_id": "xc:822:song:1",
                "substitute_xc_id": "822",
                "score_delta": 18.0,
            }
        ]

    def test_validator_flags_duplicate_xc_id_across_roles(self):
        normalized = normalize_pool_data({
            "schema_version": 2,
            "species": [
                {
                    "id": "warbler",
                    "audio_clips": {
                        "schema_version": 2,
                        "candidates": [
                            {
                                "candidate_id": "xc:831:song:0",
                                "xc_id": "831",
                                "source_role": "song",
                                "selected_role": "song",
                                "type": "song",
                                "license": CC_BY,
                                "commercial_ok": True,
                            },
                            {
                                "candidate_id": "xc:831:call:0",
                                "xc_id": "831",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "license": CC_BY,
                                "commercial_ok": True,
                            },
                        ],
                    },
                }
            ],
        })

        validator = validate_role_assignments(
            normalized["species"][0]["audio_clips"],
            export_mode="all",
        )

        assert any("must remain singular" in error.lower() for error in validator["errors"])

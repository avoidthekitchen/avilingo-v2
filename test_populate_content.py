"""Tests for populate_content.py pipeline logic."""

import pytest
from populate_content import (
    is_commercial_license,
    is_any_cc_license,
    score_recording,
    filter_background_species,
    select_clips_two_pass,
    format_summary_report,
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


class TestBackgroundSpeciesFilter:
    """Recordings with non-empty `also` field are excluded."""

    def test_empty_also_kept(self):
        recs = [_make_rec(also="")]
        assert len(filter_background_species(recs)) == 1

    def test_missing_also_kept(self):
        rec = {"q": "A", "length": "0:10"}  # no `also` key
        assert len(filter_background_species([rec])) == 1

    def test_non_empty_also_excluded(self):
        recs = [_make_rec(also="Steller's Jay, Dark-eyed Junco")]
        assert len(filter_background_species(recs)) == 0

    def test_whitespace_only_also_kept(self):
        recs = [_make_rec(also="   ")]
        assert len(filter_background_species(recs)) == 1

    def test_mixed_recordings_filters_correctly(self):
        recs = [
            _make_rec(also=""),
            _make_rec(also="Robin"),
            _make_rec(also=""),
            _make_rec(also="Wren, Sparrow"),
        ]
        result = filter_background_species(recs)
        assert len(result) == 2


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


class TestTwoPassSelection:
    """select_clips_two_pass does commercial-first, then NC fallback."""

    def test_all_commercial_clips_flagged_commercial_ok(self):
        """When enough commercial clips exist, all are commercial_ok=True."""
        recs = [_make_xc_rec(xc_id=str(i), rec_type="song", lic=CC_BY) for i in range(5)]
        recs += [_make_xc_rec(xc_id=str(i + 10), rec_type="call", lic=CC_BY) for i in range(3)]
        result = select_clips_two_pass(recs, "TestSpecies")
        songs = result["songs"]
        calls = result["calls"]
        assert len(songs) == 3
        assert len(calls) == 2
        assert all(c["commercial_ok"] for c in songs + calls)

    def test_nc_fallback_when_insufficient_commercial_songs(self):
        """With only 1 commercial song, NC songs are added with commercial_ok=False."""
        recs = [
            _make_xc_rec(xc_id="1", rec_type="song", lic=CC_BY),
            _make_xc_rec(xc_id="2", rec_type="song", lic=CC_BY_NC),
            _make_xc_rec(xc_id="3", rec_type="song", lic=CC_BY_NC),
            _make_xc_rec(xc_id="4", rec_type="song", lic=CC_BY_NC),
        ]
        # Enough calls so we don't trigger call fallback
        recs += [_make_xc_rec(xc_id=str(i + 10), rec_type="call", lic=CC_BY) for i in range(3)]
        result = select_clips_two_pass(recs, "TestSpecies")
        songs = result["songs"]
        assert len(songs) == 3
        commercial = [s for s in songs if s["commercial_ok"]]
        nc = [s for s in songs if not s["commercial_ok"]]
        assert len(commercial) == 1
        assert len(nc) == 2

    def test_nc_fallback_when_insufficient_commercial_calls(self):
        """With 0 commercial calls, NC calls are used with commercial_ok=False."""
        recs = [_make_xc_rec(xc_id=str(i), rec_type="song", lic=CC_BY) for i in range(5)]
        recs += [
            _make_xc_rec(xc_id="10", rec_type="call", lic=CC_BY_NC),
            _make_xc_rec(xc_id="11", rec_type="call", lic=CC_BY_NC),
        ]
        result = select_clips_two_pass(recs, "TestSpecies")
        calls = result["calls"]
        assert len(calls) == 2
        assert all(not c["commercial_ok"] for c in calls)

    def test_background_species_excluded_before_selection(self):
        """Recordings with background species are excluded entirely."""
        recs = [
            _make_xc_rec(xc_id="1", rec_type="song", lic=CC_BY, also=""),
            _make_xc_rec(xc_id="2", rec_type="song", lic=CC_BY, also="Robin"),
            _make_xc_rec(xc_id="3", rec_type="song", lic=CC_BY, also=""),
            _make_xc_rec(xc_id="4", rec_type="song", lic=CC_BY, also=""),
        ]
        recs += [_make_xc_rec(xc_id=str(i + 10), rec_type="call", lic=CC_BY) for i in range(3)]
        result = select_clips_two_pass(recs, "TestSpecies")
        # Only 3 clean songs available, xc_id="2" excluded
        song_ids = [s["xc_id"] for s in result["songs"]]
        assert "2" not in song_ids
        assert len(result["songs"]) == 3

    def test_clips_have_required_fields(self):
        """Each clip dict includes all expected fields plus commercial_ok."""
        recs = [_make_xc_rec(xc_id="42", rec_type="song")]
        recs += [_make_xc_rec(xc_id="43", rec_type="call")]
        result = select_clips_two_pass(recs, "TestSpecies")
        clip = result["songs"][0]
        required = {"xc_id", "xc_url", "audio_url", "type", "quality", "length",
                     "recordist", "license", "location", "country", "score", "commercial_ok"}
        assert required.issubset(clip.keys())

    def test_returns_nc_fallback_info(self):
        """Return value includes info about whether NC fallback was needed."""
        recs = [
            _make_xc_rec(xc_id="1", rec_type="song", lic=CC_BY_NC),
            _make_xc_rec(xc_id="2", rec_type="song", lic=CC_BY_NC),
            _make_xc_rec(xc_id="3", rec_type="song", lic=CC_BY_NC),
        ]
        recs += [_make_xc_rec(xc_id=str(i + 10), rec_type="call", lic=CC_BY) for i in range(3)]
        result = select_clips_two_pass(recs, "TestSpecies")
        assert result["nc_fallback"] is True
        assert result["nc_clip_count"] == 3


class TestSummaryReport:
    """format_summary_report produces a human-readable summary of pipeline results."""

    def _make_species_results(self):
        """Build sample species results for summary testing."""
        return [
            {
                "name": "American Robin",
                "songs": 3, "calls": 2,
                "commercial_clips": 5, "nc_clips": 0,
                "nc_fallback": False,
            },
            {
                "name": "Dark-eyed Junco",
                "songs": 2, "calls": 1,
                "commercial_clips": 1, "nc_clips": 2,
                "nc_fallback": True,
            },
            {
                "name": "Song Sparrow",
                "songs": 3, "calls": 2,
                "commercial_clips": 3, "nc_clips": 2,
                "nc_fallback": True,
            },
        ]

    def test_report_contains_nc_fallback_species(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        assert "Dark-eyed Junco" in report
        assert "Song Sparrow" in report

    def test_report_contains_under_target_species(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        # Junco has 2 songs (< 3 target) and 1 call (< 2 target)
        assert "Dark-eyed Junco" in report

    def test_report_contains_commercial_vs_nc_totals(self):
        results = self._make_species_results()
        report = format_summary_report(results)
        # Total: 9 commercial, 4 NC = 13 total
        assert "9" in report  # commercial count
        assert "4" in report  # NC count

    def test_report_no_nc_fallback_when_all_commercial(self):
        results = [
            {"name": "Robin", "songs": 3, "calls": 2,
             "commercial_clips": 5, "nc_clips": 0, "nc_fallback": False},
        ]
        report = format_summary_report(results)
        assert "No species required NC fallback" in report

    def test_report_no_under_target_when_all_full(self):
        results = [
            {"name": "Robin", "songs": 3, "calls": 2,
             "commercial_clips": 5, "nc_clips": 0, "nc_fallback": False},
        ]
        report = format_summary_report(results)
        assert "All species met clip targets" in report

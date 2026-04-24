from pathlib import Path

import pytest

from admin.server import persist_candidate_role_assignment, persist_candidate_segment, reset_candidate_segment
from populate_content import load_pool_file, save_pool_file


def _write_pool(path: Path) -> None:
    save_pool_file(
        path,
        {
            "species": [
                {
                    "id": "sp1",
                    "common_name": "Test Bird",
                    "scientific_name": "Avis testus",
                    "audio_clips": {
                        "candidates": [
                            {
                                "candidate_id": "xc:1:song:0",
                                "xc_id": "1",
                                "source_role": "song",
                                "selected_role": "none",
                                "type": "song",
                            },
                            {
                                "candidate_id": "xc:2:call:0",
                                "xc_id": "2",
                                "source_role": "call",
                                "selected_role": "call",
                                "type": "call",
                                "analysis": {"status": "ok", "summary": {"target_detection_count": 1}},
                            },
                        ],
                    },
                },
            ],
        },
    )


def test_persist_candidate_role_assignment_writes_explicit_role_and_none(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)

    persist_candidate_role_assignment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:1:song:0",
        xc_id="1",
        selected_role="call",
    )
    after_assignment = load_pool_file(pool_file)
    assigned_role = after_assignment["species"][0]["audio_clips"]["candidates"][0]["selected_role"]
    assert assigned_role == "call"

    persist_candidate_role_assignment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:1:song:0",
        xc_id="1",
        selected_role="none",
    )
    after_removal = load_pool_file(pool_file)
    removed_role = after_removal["species"][0]["audio_clips"]["candidates"][0]["selected_role"]
    assert removed_role == "none"


def test_persist_candidate_role_assignment_rejects_unknown_role(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)

    with pytest.raises(ValueError, match="selected_role"):
        persist_candidate_role_assignment(
            pool_file=pool_file,
            species_id="sp1",
            candidate_id="xc:1:song:0",
            xc_id="1",
            selected_role="duet",
        )


def test_persist_candidate_segment_saves_manual_trim_without_changing_candidate_metadata(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)

    updated = persist_candidate_segment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:2:call:0",
        xc_id="2",
        start_s=1.25,
        end_s=6.75,
    )

    assert updated["selected_role"] == "call"
    assert updated["analysis"] == {
        "status": "ok",
        "provider": None,
        "target_detections": [],
        "overlap_detections": [],
        "summary": {"target_detection_count": 1},
        "failure": None,
    }
    assert updated["candidate_id"] == "xc:2:call:0"
    assert updated["xc_id"] == "2"
    assert updated["segment"] == {
        "status": "manual",
        "start_s": 1.25,
        "end_s": 6.75,
        "duration_s": 5.5,
        "confidence": None,
        "fallback_reason": None,
    }

    reloaded = load_pool_file(pool_file)
    persisted_segment = reloaded["species"][0]["audio_clips"]["candidates"][1]["segment"]
    assert persisted_segment["status"] == "manual"
    assert persisted_segment["start_s"] == 1.25
    assert persisted_segment["end_s"] == 6.75
    assert persisted_segment["duration_s"] == 5.5


@pytest.mark.parametrize(
    ("start_s", "end_s", "message"),
    [
        ("nope", 3.0, "numeric"),
        (5.0, 5.0, "less than end_s"),
        (6.0, 5.0, "less than end_s"),
        (-1.0, 5.0, "greater than or equal to 0"),
    ],
)
def test_persist_candidate_segment_rejects_invalid_trim_without_mutating_existing_segment(
    tmp_path: Path,
    start_s,
    end_s,
    message: str,
):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)
    persist_candidate_segment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:2:call:0",
        xc_id="2",
        start_s=1.0,
        end_s=4.0,
    )

    with pytest.raises(ValueError, match=message):
        persist_candidate_segment(
            pool_file=pool_file,
            species_id="sp1",
            candidate_id="xc:2:call:0",
            xc_id="2",
            start_s=start_s,
            end_s=end_s,
        )

    reloaded = load_pool_file(pool_file)
    segment = reloaded["species"][0]["audio_clips"]["candidates"][1]["segment"]
    assert segment["status"] == "manual"
    assert segment["start_s"] == 1.0
    assert segment["end_s"] == 4.0


def test_persist_candidate_segment_rejects_non_selected_clip(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)

    with pytest.raises(ValueError, match="selected"):
        persist_candidate_segment(
            pool_file=pool_file,
            species_id="sp1",
            candidate_id="xc:1:song:0",
            xc_id="1",
            start_s=1.0,
            end_s=3.0,
        )


def test_reset_candidate_segment_clears_manual_trim(tmp_path: Path):
    pool_file = tmp_path / "pool.json"
    _write_pool(pool_file)
    persist_candidate_segment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:2:call:0",
        xc_id="2",
        start_s=1.0,
        end_s=4.0,
    )

    updated = reset_candidate_segment(
        pool_file=pool_file,
        species_id="sp1",
        candidate_id="xc:2:call:0",
        xc_id="2",
    )

    assert updated["selected_role"] == "call"
    assert updated["segment"] == {
        "status": "not_set",
        "start_s": None,
        "end_s": None,
        "duration_s": None,
        "confidence": None,
        "fallback_reason": None,
    }

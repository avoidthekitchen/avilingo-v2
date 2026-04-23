from pathlib import Path

import pytest

from admin.server import persist_candidate_role_assignment
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

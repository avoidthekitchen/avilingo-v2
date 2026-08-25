import array
import json
import subprocess
from pathlib import Path

import pytest
import requests

from manual_audio import (
    ACTIVE_WINDOW_SECONDS,
    ManualAudioError,
    check_manual_audio,
    choose_active_window,
    encode_audio,
    load_base_manifest,
    load_selections,
    project_xc_recording,
    fetch_xc_recording,
    sync_manual_audio,
)


def make_audio(path: Path, segments: list[tuple[str, float]]) -> None:
    filters = []
    for index, (kind, duration) in enumerate(segments):
        if kind == "silence":
            filters.append(f"aevalsrc=0:s=44100:d={duration}[a{index}]")
        elif kind == "tone":
            filters.append(f"sine=frequency=1800:sample_rate=44100:duration={duration}[a{index}]")
        else:
            raise ValueError(kind)
    inputs = "".join(f"[a{index}]" for index in range(len(segments)))
    filter_complex = ";".join(filters) + f";{inputs}concat=n={len(segments)}:v=0:a=1[out]"
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-filter_complex", filter_complex, "-map", "[out]", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def estimate_frequency(path: Path, *, sample_rate: int = 8000) -> float:
    result = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sample_rate),
            "-f", "s16le", "-",
        ],
        check=True,
        stdout=subprocess.PIPE,
    )
    samples = array.array("h")
    samples.frombytes(result.stdout)
    edge = sample_rate // 10
    samples = samples[edge:-edge]
    crossings = sum((left < 0) != (right < 0) for left, right in zip(samples, samples[1:]))
    return crossings * sample_rate / (2 * len(samples))


def minimal_base(species: list[tuple[str, str]]) -> dict:
    return {
        "version": "test",
        "species": [
            {
                "id": species_id,
                "common_name": scientific_name,
                "scientific_name": scientific_name,
                "audio_clips": {"songs": [], "calls": []},
                "photo": {"url": "/photo.jpg"},
            }
            for species_id, scientific_name in species
        ],
        "confuser_pairs": [],
        "lesson_plan": {"lessons": []},
    }


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value))


def test_checked_in_selections_losslessly_migrate_current_assignments():
    base = load_base_manifest()
    selection_file = load_selections(base_manifest=base)

    assert len(selection_file.selections) == 30
    assert {(item.species_id, item.role) for item in selection_file.selections} == {
        (species["id"], role)
        for species in base["species"]
        for role in ("song", "call")
    }

    by_key = {item.key: item for item in selection_file.selections}
    expected = {
        "amro:song:xc171727": (0.002, 4.6),
        "amro:call:xc385843": (0.0, 3.1),
        "amcr:song:xc531008": (2.5, 5.5),
        "amcr:call:xc682428": (2.0, 5.0),
        "sosp:song:xc803814": (2.5, 6.0),
        "sosp:call:xc829233": (4.0, 8.0),
        "deju:song:xc569535": (8.98, 11.48),
        "deju:call:xc254480": (1.2, 3.5),
        "bcch:song:xc866009": (3.6, 5.0),
        "bcch:call:xc636533": (2.6, 7.0),
        "spto:song:xc575461": (5.0, 7.3),
        "spto:call:xc717557": (0.7, 2.7),
        "hofi:song:xc875451": (7.65, 13.25),
        "hofi:call:xc573017": (0.0, 3.7),
        "nofl:song:xc645833": (1.5, 7.5),
        "nofl:call:xc613544": (5.5, 9.1),
        "stja:song:xc603262": (2.3, 6.3),
        "stja:call:xc109654": (1.6, 3.6),
        "bewr:song:xc800769": (0.8, 6.0),
        "bewr:call:xc553922": (23.8, 28.9),
        "anhu:song:xc860679": (13.2, 17.0),
        "anhu:call:xc697495": (1.8, 3.8),
        "cbch:song:xc702313": (7.0, 11.7),
        "cbch:call:xc364352": (2.65, 7.15),
        "bush:song:xc215759": (2.8, 5.5),
        "bush:call:xc149398": (1.7, 6.9),
        "gcsp:song:xc345344": (0.2, 2.2),
        "gcsp:call:xc440249": (2.0, 4.4),
        "eust:song:xc593357": (0.0, 3.6),
        "eust:call:xc614156": (57.75, 60.05),
    }
    assert set(by_key) == set(expected)
    for key, interval in expected.items():
        assert (by_key[key].start_s, by_key[key].end_s) == interval
    for key in (
        "deju:song:xc569535",
        "hofi:song:xc875451",
        "bewr:call:xc553922",
        "anhu:song:xc860679",
        "cbch:call:xc364352",
        "eust:call:xc614156",
    ):
        assert "offset-corrected" in (by_key[key].note or "")


def test_selection_parser_accepts_xc_prefix_and_rejects_partial_trim(tmp_path: Path):
    base_path = tmp_path / "base.json"
    selections_path = tmp_path / "selections.toml"
    write_json(base_path, minimal_base([("bird", "Example bird")]))
    selections_path.write_text(
        """
version = 1
[[species.bird.songs]]
xc = "XC123"
[[species.bird.calls]]
xc = "xc124"
start_s = 1
"""
    )

    with pytest.raises(ManualAudioError, match="both start_s and end_s"):
        load_selections(selections_path, base_manifest=load_base_manifest(base_path))


def test_selection_parser_rejects_duplicate_recording_across_roles(tmp_path: Path):
    base_path = tmp_path / "base.json"
    selections_path = tmp_path / "selections.toml"
    write_json(base_path, minimal_base([("bird", "Example bird")]))
    selections_path.write_text(
        """
version = 1
[[species.bird.songs]]
xc = 123
[[species.bird.calls]]
xc = "XC123"
"""
    )

    with pytest.raises(ManualAudioError, match="selected more than once"):
        load_selections(selections_path, base_manifest=load_base_manifest(base_path))


def test_active_window_finds_sustained_sound_instead_of_leading_silence(tmp_path: Path):
    source = tmp_path / "source.wav"
    make_audio(source, [("silence", 12.0), ("tone", 10.0), ("silence", 4.0)])

    result = choose_active_window(source, 26.0)

    assert result["mode"] == "automatic"
    assert result["end_s"] - result["start_s"] == ACTIVE_WINDOW_SECONDS
    assert 11.5 <= result["start_s"] <= 12.5
    assert result["activity_pct"] >= 90
    assert result["warning"] is None


def test_active_window_uses_entire_short_recording_without_analysis(tmp_path: Path):
    result = choose_active_window(tmp_path / "does-not-need-to-exist.wav", 7.25)

    assert result == {
        "mode": "full",
        "start_s": 0.0,
        "end_s": 7.25,
        "activity_pct": None,
        "warning": None,
    }


def test_encode_audio_selects_requested_content_not_only_requested_duration(tmp_path: Path):
    source = tmp_path / "three-tones.wav"
    output = tmp_path / "middle-tone.ogg"
    filter_complex = (
        "sine=frequency=400:sample_rate=44100:duration=3[first];"
        "sine=frequency=1800:sample_rate=44100:duration=3[middle];"
        "sine=frequency=3000:sample_rate=44100:duration=3[last];"
        "[first][middle][last]concat=n=3:v=0:a=1[out]"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-filter_complex", filter_complex, "-map", "[out]", str(source)],
        check=True,
    )

    encode_audio(source, output, start_s=3.0, end_s=6.0)

    assert estimate_frequency(output) == pytest.approx(1800, abs=25)


def test_project_xc_recording_rejects_unsupported_license():
    with pytest.raises(ManualAudioError, match="unsupported license"):
        project_xc_recording(
            {
                "id": "123",
                "gen": "Example",
                "sp": "bird",
                "file": "https://xeno-canto.org/123/download",
                "lic": "https://creativecommons.org/licenses/by-nd/4.0/",
            },
            "123",
        )


def test_xc_lookup_error_does_not_expose_api_key():
    class FailingSession:
        @staticmethod
        def get(*args, **kwargs):
            del args, kwargs
            raise requests.ConnectionError("request URL included key=super-secret")

    with pytest.raises(ManualAudioError) as caught:
        fetch_xc_recording("123", api_key="super-secret", session=FailingSession())

    assert "super-secret" not in str(caught.value)
    assert str(caught.value) == "Failed to resolve XC123: network request failed"


class FakeResponse:
    def __init__(self, *, payload: dict | None = None, body: bytes | None = None):
        self.payload = payload
        self.body = body or b""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        assert self.payload is not None
        return self.payload

    def iter_content(self, chunk_size: int):
        del chunk_size
        yield self.body


class FakeSession:
    def __init__(self, recordings: dict[str, dict], sources: dict[str, bytes]):
        self.recordings = recordings
        self.sources = sources
        self.api_calls: list[str] = []
        self.download_calls: list[str] = []

    def get(self, url: str, **kwargs):
        if "/api/3/recordings" in url:
            xc_id = kwargs["params"]["query"].removeprefix("nr:")
            self.api_calls.append(xc_id)
            return FakeResponse(payload={"recordings": [self.recordings[xc_id]]})
        self.download_calls.append(url)
        return FakeResponse(body=self.sources[url])


def xc_recording(xc_id: str, source_url: str, *, recording_type: str) -> dict:
    return {
        "id": xc_id,
        "gen": "Example",
        "sp": "bird",
        "en": "Example Bird",
        "type": recording_type,
        "q": "A",
        "length": "0:15",
        "rec": "Expert Recordist",
        "lic": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        "loc": "Seattle",
        "cnt": "United States",
        "file": source_url,
    }


def test_sync_builds_role_assigned_manifest_lock_and_offline_check(tmp_path: Path):
    base_path = tmp_path / "base.json"
    selections_path = tmp_path / "selections.toml"
    lock_path = tmp_path / "lock.json"
    manifest_path = tmp_path / "manifest.json"
    audio_dir = tmp_path / "audio"
    cache_dir = tmp_path / "cache"
    write_json(base_path, minimal_base([("bird", "Example bird")]))
    selections_path.write_text(
        """
version = 1
curator = "Bird Expert"
[[species.bird.songs]]
xc = 101
start_s = 1.0
end_s = 4.0
[[species.bird.calls]]
xc = 102
"""
    )

    song_source = tmp_path / "song.wav"
    call_source = tmp_path / "call.wav"
    make_audio(song_source, [("tone", 6.0)])
    make_audio(call_source, [("silence", 3.0), ("tone", 10.0), ("silence", 2.0)])
    song_url = "https://xeno-canto.org/101/download"
    call_url = "https://xeno-canto.org/102/download"
    session = FakeSession(
        {
            # Deliberately reverse XC's labels: placement in the TOML owns the app role.
            "101": xc_recording("101", song_url, recording_type="call"),
            "102": xc_recording("102", call_url, recording_type="song"),
        },
        {song_url: song_source.read_bytes(), call_url: call_source.read_bytes()},
    )

    result = sync_manual_audio(
        selections_path=selections_path,
        base_manifest_path=base_path,
        lock_path=lock_path,
        manifest_out=manifest_path,
        audio_dir=audio_dir,
        cache_dir=cache_dir,
        api_key="test-key",
        session=session,
    )

    assert set(result["generated"]) == {"bird:song:xc101", "bird:call:xc102"}
    assert any("non-commercial" in warning for warning in result["warnings"])
    manifest = json.loads(manifest_path.read_text())
    species = manifest["species"][0]
    assert [clip["xc_id"] for clip in species["audio_clips"]["songs"]] == ["101"]
    assert [clip["xc_id"] for clip in species["audio_clips"]["calls"]] == ["102"]
    assert species["audio_clips"]["songs"][0]["type"] == "call"
    assert species["audio_clips"]["calls"][0]["type"] == "song"
    assert manifest["audio_build"]["mode"] == "manual"
    assert result["lock"]["outputs"]["bird:song:xc101"]["trim"]["mode"] == "manual"
    assert result["lock"]["outputs"]["bird:call:xc102"]["trim"]["mode"] == "automatic"
    assert check_manual_audio(
        selections_path=selections_path,
        base_manifest_path=base_path,
        lock_path=lock_path,
        manifest_path=manifest_path,
        audio_dir=audio_dir,
    ) == []

    # A second sync is offline and reuses both generated outputs.
    offline_session = FakeSession({}, {})
    second = sync_manual_audio(
        selections_path=selections_path,
        base_manifest_path=base_path,
        lock_path=lock_path,
        manifest_out=manifest_path,
        audio_dir=audio_dir,
        cache_dir=cache_dir,
        session=offline_session,
    )
    assert len(second["reused"]) == 2
    assert offline_session.api_calls == []
    assert offline_session.download_calls == []

    refreshed = sync_manual_audio(
        selections_path=selections_path,
        base_manifest_path=base_path,
        lock_path=lock_path,
        manifest_out=manifest_path,
        audio_dir=audio_dir,
        cache_dir=cache_dir,
        refresh_windows=True,
        session=offline_session,
    )
    assert refreshed["reused"] == ["bird:song:xc101"]
    assert refreshed["generated"] == ["bird:call:xc102"]


def test_offline_check_reports_changed_selection_file(tmp_path: Path):
    base_path = tmp_path / "base.json"
    selections_path = tmp_path / "selections.toml"
    lock_path = tmp_path / "lock.json"
    write_json(base_path, minimal_base([("bird", "Example bird")]))
    selections_path.write_text(
        """
version = 1
[[species.bird.songs]]
xc = 101
[[species.bird.calls]]
xc = 102
"""
    )
    write_json(
        lock_path,
        {
            "schema_version": 1,
            "algorithm_version": "sustained-energy-v1",
            "encoder_version": "opus-96k-loudnorm-v1",
            "selection_digest": "stale",
            "base_manifest_digest": "stale",
            "recordings": {},
            "outputs": {},
        },
    )

    errors = check_manual_audio(
        selections_path=selections_path,
        base_manifest_path=base_path,
        lock_path=lock_path,
        manifest_path=tmp_path / "missing-manifest.json",
        audio_dir=tmp_path / "audio",
    )

    assert "Manual audio selections changed; run the manual audio sync" in errors
    assert "Base manifest changed; run the manual audio sync" in errors
    assert any("Generated manifest is missing" in error for error in errors)

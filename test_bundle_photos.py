import json
import struct
from pathlib import Path

import pytest

from bundle_photos import (
    BundledPhotoError,
    check_photos,
    commons_thumbnail_url,
    download_photo,
    expected_photos,
    image_size,
    sync_photos,
)


def make_jpeg(width: int, height: int, *, marker: int = 0xC0) -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    frame = b"\xff" + bytes([marker]) + struct.pack(">HBHHB", 17, 8, height, width, 3) + b"\x00" * 9
    return b"\xff\xd8" + app0 + frame + b"\xff\xd9"


def make_png(width: int, height: int) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00"


def photo_entry(species_id: str, commons_name: str, *, height: int = 720) -> dict:
    return {
        "url": f"/content/bird-photos/{species_id}-960.jpg",
        "width": 960,
        "height": height,
        "filename": commons_name,
        "source": "wikimedia_commons",
        "license": "CC BY-SA 4.0",
        "srcset": f"/content/bird-photos/{species_id}-250.jpg 250w, /content/bird-photos/{species_id}-960.jpg 960w",
        "creator": "Photographer",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
        "source_url": f"https://commons.wikimedia.org/wiki/File:{commons_name}",
        "wikipedia_page": "https://en.wikipedia.org/wiki/Bird",
    }


def write_base(path: Path, photos: dict[str, dict]) -> None:
    species = [{"id": species_id, "photo": photo} for species_id, photo in photos.items()]
    path.write_text(json.dumps({"species": species}))


class FakeResponse:
    def __init__(self, content: bytes):
        self.content = content

    def raise_for_status(self) -> None:
        return None


class FakeSession:
    def __init__(self, files: dict[str, bytes]):
        self.files = files
        self.calls: list[str] = []

    def get(self, url: str, **kwargs):
        assert "BeakSpeak" in kwargs["headers"]["User-Agent"]
        self.calls.append(url)
        return FakeResponse(self.files[url])


class OfflineSession:
    def get(self, url: str, **kwargs):
        raise AssertionError(f"Unexpected network request: {url}")


def thumbnails(commons_name: str, *, height_960: int = 720) -> dict[str, bytes]:
    return {
        commons_thumbnail_url(commons_name, 250): make_jpeg(250, round(height_960 * 250 / 960)),
        commons_thumbnail_url(commons_name, 960): make_jpeg(960, height_960),
    }


@pytest.fixture
def paths(tmp_path: Path) -> dict[str, Path]:
    return {
        "base_manifest_path": tmp_path / "base.json",
        "lock_path": tmp_path / "photo.lock.json",
        "photo_dir": tmp_path / "bird-photos",
    }


def test_commons_thumbnail_url_matches_wikimedia_layout():
    assert commons_thumbnail_url("American_robin_(71307).jpg", 250) == (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/American_robin_%2871307%29.jpg/"
        "250px-American_robin_%2871307%29.jpg"
    )
    assert commons_thumbnail_url("Steller's Jay flagstaff arizona.jpg", 960) == (
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/Steller%27s_Jay_flagstaff_arizona.jpg/"
        "960px-Steller%27s_Jay_flagstaff_arizona.jpg"
    )


def test_image_size_reads_jpeg_and_png_headers():
    assert image_size(make_jpeg(960, 641)) == (960, 641)
    assert image_size(make_jpeg(250, 188, marker=0xC2)) == (250, 188)
    assert image_size(make_png(250, 100)) == (250, 100)
    with pytest.raises(BundledPhotoError):
        image_size(b"<html>rate limited</html>")


@pytest.mark.parametrize("data", [make_jpeg(960, 641)[:26], make_png(250, 100)[:20]])
def test_image_size_reports_truncated_images_as_unreadable(data):
    with pytest.raises(BundledPhotoError, match="truncated"):
        image_size(data)


def test_download_retries_a_truncated_body(monkeypatch):
    monkeypatch.setattr("bundle_photos.time.sleep", lambda seconds: None)
    url = commons_thumbnail_url("American_robin_(71307).jpg", 960)
    bodies = iter([make_jpeg(960, 720)[:26], make_jpeg(960, 720)])

    class FlakySession:
        def get(self, url: str, **kwargs):
            return FakeResponse(next(bodies))

    assert download_photo(url, session=FlakySession()) == make_jpeg(960, 720)


def test_sync_downloads_locks_and_then_checks_offline(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    session = FakeSession(thumbnails("American_robin_(71307).jpg"))

    result = sync_photos(**paths, session=session)

    assert result["downloaded"] == ["amro-250.jpg", "amro-960.jpg"]
    assert len(session.calls) == 2
    assert (paths["photo_dir"] / "amro-960.jpg").read_bytes() == make_jpeg(960, 720)
    locked = json.loads(paths["lock_path"].read_text())["photos"]["amro-960.jpg"]
    assert locked["path"] == "/content/bird-photos/amro-960.jpg"
    assert locked["thumbnail_url"] == commons_thumbnail_url("American_robin_(71307).jpg", 960)
    assert locked["source_url"] == "https://commons.wikimedia.org/wiki/File:American_robin_(71307).jpg"
    assert locked["pixel_height"] == 720
    assert check_photos(**paths) == []

    rerun = sync_photos(**paths, session=OfflineSession())
    assert rerun["downloaded"] == []
    assert rerun["reused"] == ["amro-250.jpg", "amro-960.jpg"]


def test_sync_prunes_photos_the_manifest_no_longer_references(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    paths["photo_dir"].mkdir()
    (paths["photo_dir"] / "old-960.jpg").write_bytes(b"old")

    result = sync_photos(**paths, session=FakeSession(thumbnails("American_robin_(71307).jpg")))

    assert result["pruned"] == ["old-960.jpg"]
    assert not (paths["photo_dir"] / "old-960.jpg").exists()


def test_sync_redownloads_when_the_commons_file_changes(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    sync_photos(**paths, session=FakeSession(thumbnails("American_robin_(71307).jpg")))

    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "Turdus_migratorius.jpg", height=640)})
    assert any("does not match the Commons file" in error for error in check_photos(**paths))

    session = FakeSession(thumbnails("Turdus_migratorius.jpg", height_960=640))
    result = sync_photos(**paths, session=session)

    assert result["downloaded"] == ["amro-250.jpg", "amro-960.jpg"]
    assert check_photos(**paths) == []


def test_sync_rejects_a_thumbnail_with_the_wrong_width_without_writing_files(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    files = thumbnails("American_robin_(71307).jpg")
    files[commons_thumbnail_url("American_robin_(71307).jpg", 960)] = make_jpeg(800, 600)

    with pytest.raises(BundledPhotoError, match="800px wide"):
        sync_photos(**paths, session=FakeSession(files))

    assert not paths["lock_path"].exists()
    assert not paths["photo_dir"].exists()


def test_check_reports_modified_missing_and_unexpected_photos(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    sync_photos(**paths, session=FakeSession(thumbnails("American_robin_(71307).jpg")))

    (paths["photo_dir"] / "amro-250.jpg").write_bytes(make_jpeg(250, 100))
    (paths["photo_dir"] / "amro-960.jpg").unlink()
    (paths["photo_dir"] / "stray.jpg").write_bytes(b"stray")
    (paths["photo_dir"] / ".DS_Store").write_bytes(b"finder")

    errors = check_photos(**paths)

    assert any("modified or stale" in error and "amro-250.jpg" in error for error in errors)
    assert any("missing" in error and "amro-960.jpg" in error for error in errors)
    assert any("Unreferenced bundled photo" in error and "stray.jpg" in error for error in errors)
    assert not any(".DS_Store" in error for error in errors)


def test_check_reports_a_manifest_height_that_does_not_match_the_photo(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})
    sync_photos(**paths, session=FakeSession(thumbnails("American_robin_(71307).jpg")))

    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg", height=700)})

    assert check_photos(**paths) == ["amro photo height 700 does not match 720px"]


def test_check_requires_a_lock(paths):
    write_base(paths["base_manifest_path"], {"amro": photo_entry("amro", "American_robin_(71307).jpg")})

    assert check_photos(**paths) == [f"Photo lock not found: {paths['lock_path']}; run the photo sync first"]


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"url": "https://thumb.wikimedia.org/x/960px-x.jpg"}, "url must be its largest srcset candidate"),
        (
            {"srcset": "https://thumb.wikimedia.org/x/250px-x.jpg 250w, /content/bird-photos/amro-960.jpg 960w"},
            "must be /content/bird-photos/amro-250.jpg",
        ),
        ({"srcset": "/content/bird-photos/amro-960.jpg"}, "Invalid srcset candidate"),
        ({"width": 800}, "width must match"),
        ({"source_url": "https://commons.wikimedia.org/wiki/File:Other.jpg"}, "source_url does not name"),
        ({"filename": "Robin.svg", "source_url": "https://commons.wikimedia.org/wiki/File:Robin.svg"}, "unsupported file type"),
    ],
)
def test_manifest_photos_must_be_local_and_match_their_commons_source(change, message):
    photo = {**photo_entry("amro", "American_robin_(71307).jpg"), **change}

    with pytest.raises(BundledPhotoError, match=message):
        expected_photos({"species": [{"id": "amro", "photo": photo}]})


@pytest.mark.parametrize("species_ids", [[""], ["amro", "amro"]])
def test_manifest_species_ids_must_be_present_and_unique(species_ids):
    species = [{"id": species_id, "photo": photo_entry("amro", "American_robin_(71307).jpg")} for species_id in species_ids]

    with pytest.raises(BundledPhotoError, match="missing or duplicate species ID"):
        expected_photos({"species": species})


def test_percent_encoded_source_urls_name_the_same_commons_file():
    photo = photo_entry("stja", "Steller's_Jay_flagstaff_arizona.jpg")
    photo["source_url"] = "https://commons.wikimedia.org/wiki/File:Steller%27s_Jay_flagstaff_arizona.jpg"

    assert set(expected_photos({"species": [{"id": "stja", "photo": photo}]})) == {"stja-250.jpg", "stja-960.jpg"}


def test_repository_photos_are_current():
    root = Path(__file__).parent
    assert check_photos(
        base_manifest_path=root / "content/manifest-base.json",
        lock_path=root / "content/photo-metadata.lock.json",
        photo_dir=root / "beakspeak/public/content/bird-photos",
    ) == []

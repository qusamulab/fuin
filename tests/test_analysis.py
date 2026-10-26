import zipfile

import pytest

from fuin.reporting import analyze_targets
from tests.fixtures import make_minimal_apk


@pytest.fixture
def target_apk(tmp_path):
    path = tmp_path / "targets.apk"
    path.write_bytes(
        make_minimal_apk(
            extra_dex={"classes2.dex": b"extra dex"},
            extra_files={
                "lib/arm64-v8a/libkeep.so": b"keep library",
                "lib/arm64-v8a/libencrypt.so": b"encrypt library",
                "assets/keep.json": b"keep asset",
                "assets/encrypt.json": b"encrypt asset",
                "assets/": b"",
                "assets/key.bin": b"internal key",
                "assets/encrypted_libs/internal.enc": b"internal library",
            },
        )
    )
    return str(path)


def test_analysis_coverage_uses_uncompressed_content(tmp_path):
    path = tmp_path / "compressed.apk"
    path.write_bytes(make_minimal_apk(dex_content=b"D" * 100_000))

    result = analyze_targets(str(path))

    with zipfile.ZipFile(path) as archive:
        content_size = sum(info.file_size for info in archive.infolist() if not info.is_dir())
    summary = result["summary"]
    assert summary["apk_size"] == path.stat().st_size
    assert summary["content_size"] == content_size
    assert summary["total_size"] == 100_000
    assert summary["coverage_percent"] == round(100_000 / content_size * 100, 1)
    assert 0 <= summary["coverage_percent"] <= 100


def test_analysis_skips_directories_and_internal_assets(target_apk):
    result = analyze_targets(target_apk)

    assert [entry["name"] for entry in result["dex"]["files"]] == [
        "classes.dex",
        "classes2.dex",
    ]
    assert [entry["name"] for entry in result["assets"]["files"]] == [
        "assets/keep.json",
        "assets/encrypt.json",
    ]
    assert result["summary"]["total_files"] == 6


def test_analysis_honors_exclusions_but_always_encrypts_dex(target_apk):
    result = analyze_targets(
        target_apk,
        exclude_files=("classes.dex", "lib/arm64-v8a/libkeep.so", "assets/keep.json"),
    )

    assert len(result["dex"]["files"]) == 2
    assert [entry["name"] for entry in result["native_libs"]["files"]] == [
        "lib/arm64-v8a/libencrypt.so"
    ]
    assert [entry["name"] for entry in result["assets"]["files"]] == ["assets/encrypt.json"]
    assert result["summary"]["total_files"] == 4


@pytest.mark.parametrize("disabled", ["encrypt_native", "encrypt_assets"])
def test_analysis_honors_disabled_category(target_apk, disabled):
    result = analyze_targets(target_apk, **{disabled: False})

    section = "native_libs" if disabled == "encrypt_native" else "assets"
    assert result[section] == {"files": [], "total_size": 0}
    assert result["summary"]["total_files"] == 4
    assert result["summary"]["total_size"] == sum(
        result[category]["total_size"] for category in ("dex", "native_libs", "assets")
    )


def test_analysis_empty_archive_has_zero_coverage(tmp_path):
    path = tmp_path / "empty.apk"
    with zipfile.ZipFile(path, "w"):
        pass

    summary = analyze_targets(str(path))["summary"]

    assert summary["content_size"] == 0
    assert summary["coverage_percent"] == 0
    assert summary["total_files"] == 0

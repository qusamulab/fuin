import json
import sys
import zipfile

import pytest

from fuin.cli import main
from tests.fixtures import make_minimal_apk


@pytest.mark.parametrize(
    "flags",
    [
        [],
        ["--exclude", "lib/arm64-v8a/libkeep.so", "--exclude", "assets/keep.json"],
        ["--no-native-encrypt"],
        ["--no-resource-encrypt"],
        ["--no-native-encrypt", "--no-resource-encrypt"],
    ],
)
def test_cli_preview_matches_actual_packed_targets(tmp_path, monkeypatch, capsys, flags):
    original = tmp_path / "input.apk"
    packed = tmp_path / "output.apk"
    optional_files = {
        "lib/arm64-v8a/libkeep.so": b"keep library",
        "lib/arm64-v8a/libencrypt.so": b"encrypt library",
        "assets/keep.json": b"keep asset",
        "assets/keep.json.backup": b"encrypt backup",
    }
    original_bytes = make_minimal_apk(
        extra_dex={"classes2.dex": b"extra dex"}, extra_files=optional_files
    )
    original.write_bytes(original_bytes)
    monkeypatch.setenv("FUIN_VERIFY_SIGNATURE", "false")

    monkeypatch.setattr(sys, "argv", ["fuin-pack", "analyze", str(original), "--json", *flags])
    main()
    preview = json.loads(capsys.readouterr().out)

    monkeypatch.setattr(
        sys,
        "argv",
        ["fuin-pack", "pack", str(original), str(packed), "--report-json", *flags],
    )
    main()
    report = json.loads(capsys.readouterr().out)

    with zipfile.ZipFile(packed) as archive:
        names = archive.namelist()
        native_manifest = (
            json.loads(archive.read("assets/native_lib_manifest.json"))
            if "assets/native_lib_manifest.json" in names
            else []
        )
        asset_map = (
            json.loads(archive.read("assets/res_map.json"))
            if "assets/res_map.json" in names
            else {}
        )
        native_targets = {entry["original_path"] for entry in native_manifest}
        asset_targets = set(asset_map)
        assert native_targets == {entry["name"] for entry in preview["native_libs"]["files"]}
        assert asset_targets == {entry["name"] for entry in preview["assets"]["files"]}
        assert set(report["encrypted_targets"]["dex_files"]) == {
            entry["name"] for entry in preview["dex"]["files"]
        }
        for name, content in optional_files.items():
            if name in native_targets | asset_targets:
                assert name not in names
            else:
                assert archive.read(name) == content

    assert original.read_bytes() == original_bytes


def test_cli_human_analysis_explains_coverage_basis(minimal_apk, monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["fuin-pack", "analyze", minimal_apk])

    main()

    output = capsys.readouterr().out
    assert "Uncompressed content:" in output
    assert "% of uncompressed content" in output

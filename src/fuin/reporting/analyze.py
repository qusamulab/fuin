"""APK encryption target analysis.

Scans an APK and reports all files that can be encrypted by fuin,
categorized by type (DEX, native libs, assets).
"""

import zipfile
from collections.abc import Collection
from pathlib import Path
from typing import TypedDict

from fuin.contract import DEX_NAME_RE, is_directory_entry, is_native_lib, is_user_asset


class FileEntry(TypedDict):
    """One encryptable file in the analysis result."""

    name: str
    size: int


class TargetSection(TypedDict):
    files: list[FileEntry]
    total_size: int


class AnalysisSummary(TypedDict):
    total_files: int
    total_size: int
    apk_size: int
    content_size: int
    coverage_percent: float


class TargetAnalysis(TypedDict):
    dex: TargetSection
    native_libs: TargetSection
    assets: TargetSection
    summary: AnalysisSummary


def _section(files: list[FileEntry]) -> TargetSection:
    return {"files": files, "total_size": sum(entry["size"] for entry in files)}


def analyze_targets(
    apk_path: str,
    *,
    encrypt_native: bool = True,
    encrypt_assets: bool = True,
    exclude_files: Collection[str] = (),
) -> TargetAnalysis:
    """Analyze an APK and return all encryptable targets.

    Returns a dict with:
      - dex: DEX files info
      - native_libs: .so files info
      - assets: user asset files info
      - summary: totals and coverage of uncompressed APK content

    Native libraries and assets honor the same switches and exact entry-name
    exclusions as the packer. DEX files are always encrypted. ``apk_size`` is
    the on-disk archive size; ``content_size`` is the uncompressed byte count
    used for coverage, so compression cannot push it above 100 percent.
    """
    apk_size = Path(apk_path).stat().st_size

    dex_files: list[FileEntry] = []
    native_files: list[FileEntry] = []
    asset_files: list[FileEntry] = []
    excluded = set(exclude_files)
    content_size = 0

    with zipfile.ZipFile(apk_path, "r") as z:
        for info in z.infolist():
            name = info.filename
            if is_directory_entry(name):
                continue
            content_size += info.file_size
            # The same predicates the encryptors use, so what `analyze` promises
            # and what `pack` delivers cannot drift apart.
            if DEX_NAME_RE.match(name):
                dex_files.append({"name": name, "size": info.file_size})
            elif name in excluded:
                continue
            elif encrypt_native and is_native_lib(name):
                native_files.append({"name": name, "size": info.file_size})
            elif encrypt_assets and is_user_asset(name):
                asset_files.append({"name": name, "size": info.file_size})

    dex = _section(dex_files)
    native = _section(native_files)
    assets = _section(asset_files)
    total_size = dex["total_size"] + native["total_size"] + assets["total_size"]
    total_files = len(dex_files) + len(native_files) + len(asset_files)

    coverage = (total_size / content_size * 100) if content_size else 0

    return {
        "dex": dex,
        "native_libs": native,
        "assets": assets,
        "summary": {
            "total_files": total_files,
            "total_size": total_size,
            "apk_size": apk_size,
            "content_size": content_size,
            "coverage_percent": round(coverage, 1),
        },
    }

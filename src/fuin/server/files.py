"""Scoped temporary files shared by upload analysis and background packing."""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory


@contextmanager
def temporary_apk(content: bytes) -> Iterator[str]:
    """Keep an uploaded APK on disk only for the duration of its processing."""
    with TemporaryDirectory(prefix="fuin-upload-") as directory:
        path = Path(directory) / "input.apk"
        path.write_bytes(content)
        yield str(path)

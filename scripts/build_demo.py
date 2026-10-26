# /// script
# requires-python = ">=3.12"
# dependencies = ["Pillow>=12"]
# ///
"""Encode timestamped browser recording frames as the documentation demo GIF.

Usage: uv run scripts/build_demo.py /path/to/recording [--output docs/demo.gif]

The recording directory contains PNG frames and frames.json, a list of objects
with ``file`` and ``elapsed_ms`` fields. Frames must be captured during actual UI
interaction; their timestamps preserve the recorded pacing.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--output", type=Path, default=Path("docs/demo.gif"))
    args = parser.parse_args()

    frames = json.loads((args.recording / "frames.json").read_text())
    images = []
    durations = []
    for index, frame in enumerate(frames):
        with Image.open(args.recording / frame["file"]) as source:
            image = ImageOps.contain(source.convert("RGB"), (900, 1100))
            canvas = Image.new("RGB", (900, 1100), "white")
            canvas.paste(image, ((900 - image.width) // 2, 0))
            images.append(canvas.quantize(colors=256))
        next_time = (
            frames[index + 1]["elapsed_ms"]
            if index + 1 < len(frames)
            else frame["elapsed_ms"] + 2000
        )
        durations.append(max(20, round((next_time - frame["elapsed_ms"]) / 10) * 10))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(
        args.output,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    print(f"Saved {args.output}: {len(images)} frames, {sum(durations) / 1000:.1f}s")


if __name__ == "__main__":
    main()

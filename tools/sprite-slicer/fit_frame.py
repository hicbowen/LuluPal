"""Fit a transparent subject to a fixed animation canvas and bottom anchor."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--subject-height", type=int, required=True)
    parser.add_argument("--padding", type=int, default=16)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    box = image.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("input has no visible subject")
    subject = image.crop(box)
    scale = min(
        args.subject_height / subject.height,
        (args.width - args.padding * 2) / subject.width,
    )
    subject = subject.resize(
        (round(subject.width * scale), round(subject.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
    x = (args.width - subject.width) // 2
    y = args.height - args.padding - subject.height
    canvas.alpha_composite(subject, (x, y))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, optimize=True)


if __name__ == "__main__":
    main()

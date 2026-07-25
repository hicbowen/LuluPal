"""Normalize walk frames around the body instead of the changing feet bounds."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def subject_box(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("frame has no visible pixels")
    return box


def upper_body_center_x(image: Image.Image, box: tuple[int, int, int, int]) -> float:
    left, top, right, bottom = box
    upper_bottom = top + max(1, round((bottom - top) * 0.42))
    alpha = image.getchannel("A")
    weighted_x = 0
    weight = 0
    for y in range(top, upper_bottom):
        for x in range(left, right):
            value = alpha.getpixel((x, y))
            if value:
                weighted_x += x * value
                weight += value
    return weighted_x / weight if weight else (left + right) / 2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--padding", type=int, default=12)
    args = parser.parse_args()

    sources = sorted(Path(args.input).glob("*.png"))
    if not sources:
        raise SystemExit("no PNG frames found")

    images = [Image.open(path).convert("RGBA") for path in sources]
    boxes = [subject_box(image) for image in images]
    heights = sorted(bottom - top for _, top, _, bottom in boxes)
    target_height = heights[len(heights) // 2]
    canvas_w = max(image.width for image in images)
    canvas_h = max(image.height for image in images)
    anchor_x = canvas_w // 2
    baseline_y = canvas_h - args.padding

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    for path, image, box in zip(sources, images, boxes):
        left, top, right, bottom = box
        subject = image.crop(box)
        scale = target_height / subject.height
        resized = subject.resize(
            (round(subject.width * scale), target_height),
            Image.Resampling.LANCZOS,
        )
        resized_box = subject_box(resized)
        body_x = upper_body_center_x(resized, resized_box)
        x = round(anchor_x - body_x)
        y = baseline_y - resized.height
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.alpha_composite(resized, (x, y))
        canvas.save(output / path.name, optimize=True)


if __name__ == "__main__":
    main()

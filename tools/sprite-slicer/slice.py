"""Split a regular sprite sheet into consistently aligned transparent PNG frames."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--padding", type=int, default=12)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    cell_w, cell_h = source.width // args.columns, source.height // args.rows
    crops: list[Image.Image] = []
    boxes: list[tuple[int, int, int, int]] = []
    for row in range(args.rows):
        for col in range(args.columns):
            cell = source.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            alpha_box = cell.getchannel("A").getbbox()
            if alpha_box is None:
                raise SystemExit(f"empty frame at row {row + 1}, column {col + 1}")
            crops.append(cell.crop(alpha_box))
            boxes.append(alpha_box)

    canvas_w = max(frame.width for frame in crops) + args.padding * 2
    canvas_h = max(frame.height for frame in crops) + args.padding * 2
    destination = Path(args.output)
    destination.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(crops, 1):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        x = (canvas_w - frame.width) // 2
        y = canvas_h - args.padding - frame.height
        canvas.alpha_composite(frame, (x, y))
        canvas.save(destination / f"{index:03d}.png", optimize=True)

    metadata = {
        "source": str(Path(args.input).as_posix()),
        "columns": args.columns,
        "rows": args.rows,
        "frameSize": [canvas_w, canvas_h],
        "frames": len(crops),
        "sourceBoxes": boxes,
    }
    (destination / "slice.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

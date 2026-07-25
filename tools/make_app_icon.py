"""Build the LuluDay app icon from an existing pet animation frame."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/pets/lulu/animations/actions/005.png"
OUTPUT = ROOT / "build/appicon.png"
SIZE = 1024


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def main() -> None:
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    shadow = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    shadow_mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle(
        (80, 96, 943, 959),
        radius=205,
        fill=150,
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(28))
    shadow.paste((83, 50, 27, 110), (0, 0, SIZE, SIZE), shadow_mask)
    icon.alpha_composite(shadow)

    panel = Image.new("RGBA", (864, 864), (255, 244, 214, 255))
    panel_draw = ImageDraw.Draw(panel)
    for y in range(panel.height):
        blend = y / (panel.height - 1)
        color = (
            round(255 - 8 * blend),
            round(244 - 35 * blend),
            round(214 - 64 * blend),
            255,
        )
        panel_draw.line((0, y, panel.width, y), fill=color)
    panel.putalpha(rounded_mask(864, 205))
    icon.alpha_composite(panel, (80, 80))

    subject = Image.open(SOURCE).convert("RGBA")
    visible = subject.getchannel("A").getbbox()
    if visible is None:
        raise SystemExit("source frame is empty")
    subject = subject.crop(visible)
    target_height = 810
    scale = target_height / subject.height
    subject = subject.resize(
        (round(subject.width * scale), target_height),
        Image.Resampling.LANCZOS,
    )

    x = (SIZE - subject.width) // 2
    y = 128
    icon.alpha_composite(subject, (x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    main()

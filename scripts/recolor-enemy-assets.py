#!/usr/bin/env python3
from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
UNIT_SOURCE = ROOT / "assets" / "units"
UNIT_TARGET = UNIT_SOURCE / "enemy"
BUILDING_SOURCE = ROOT / "assets" / "buildings"
BUILDING_TARGET = BUILDING_SOURCE / "enemy"

ENEMY_HUE = 0.985
ENEMY_RED = (160, 34, 38)
ENEMY_DARK = (84, 18, 24)

UNIT_FOLDERS = {
    "archer",
    "axeman",
    "ballista",
    "catapult",
    "crossbowman",
    "militia",
    "warrior",
    "warship",
    "FishingBoat",
    "TransportLarge",
}

UNIT_ALIASES = {
    "archer/walk/cfb79a2e-dcbb-41cb-a46c-91002f2414d5_walking-10_south.gif": "archer/walk/archer_walk_south.gif",
}


def clamp(value: float, low: int = 0, high: int = 255) -> int:
    return max(low, min(high, int(round(value))))


def blend(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(clamp(a[i] * (1.0 - t) + b[i] * t) for i in range(3))


def preserve_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return True
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luma < 18 or luma > 242


def recolor_unit_pixel(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if preserve_pixel(r, g, b, a):
        return r, g, b, a

    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    original = (r, g, b)

    if s > 0.14:
        nr, ng, nb = colorsys.hsv_to_rgb(ENEMY_HUE, min(0.88, max(0.35, s * 1.12)), v)
        shifted = (clamp(nr * 255), clamp(ng * 255), clamp(nb * 255))
        amount = 0.72 if luma < 180 else 0.55
        return (*blend(original, shifted, amount), a)

    if 42 <= luma <= 210:
        amount = 0.18 if luma < 120 else 0.12
        return (*blend(original, ENEMY_DARK, amount), a)

    return r, g, b, a


def recolor_building_pixel(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a == 0 or preserve_pixel(r, g, b, a):
        return r, g, b, a

    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    original = (r, g, b)
    teal_or_blue = 0.36 <= h <= 0.62 and s > 0.12 and v > 0.12

    if teal_or_blue:
        nr, ng, nb = colorsys.hsv_to_rgb(ENEMY_HUE, min(0.82, max(0.34, s * 1.05)), min(0.95, v * 0.98))
        shifted = (clamp(nr * 255), clamp(ng * 255), clamp(nb * 255))
        return (*blend(original, shifted, 0.83), a)

    if s > 0.20 and 0.05 <= h <= 0.18:
        return (*blend(original, ENEMY_RED, 0.10), a)

    return r, g, b, a


def recolor_image(image: Image.Image, pixel_fn) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            pixels[x, y] = pixel_fn(*pixels[x, y])
    return rgba


def recolor_gif(src: Path, dst: Path) -> None:
    image = Image.open(src)
    frames: list[Image.Image] = []
    durations: list[int] = []

    for frame in ImageSequence.Iterator(image):
        frames.append(recolor_image(frame, recolor_unit_pixel))
        durations.append(frame.info.get("duration", image.info.get("duration", 100)))

    dst.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        dst,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=image.info.get("loop", 0),
        disposal=2,
    )


def recolor_png(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    recolor_image(Image.open(src), recolor_building_pixel).save(dst)


def main() -> None:
    unit_count = 0
    for folder in sorted(UNIT_FOLDERS):
        source_dir = UNIT_SOURCE / folder
        if not source_dir.exists():
            continue
        for src in source_dir.rglob("*.gif"):
            rel = src.relative_to(UNIT_SOURCE)
            recolor_gif(src, UNIT_TARGET / rel)
            unit_count += 1

    for source_name, target_name in UNIT_ALIASES.items():
        src = UNIT_SOURCE / source_name
        if src.exists():
            recolor_gif(src, UNIT_TARGET / target_name)
            unit_count += 1

    building_count = 0
    for src in sorted(BUILDING_SOURCE.glob("*.png")):
        recolor_png(src, BUILDING_TARGET / src.name)
        building_count += 1

    print(f"generated {unit_count} enemy unit gifs")
    print(f"generated {building_count} enemy building pngs")


if __name__ == "__main__":
    main()

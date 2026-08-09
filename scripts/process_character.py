#!/usr/bin/env python3
"""Create a transparent, tightly cropped theater character from the source PNG."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


def white_distance(pixel: tuple[int, int, int, int]) -> float:
    red, green, blue, _ = pixel
    return ((255 - red) ** 2 + (255 - green) ** 2 + (255 - blue) ** 2) ** 0.5


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--crop-bottom", type=int, default=700)
    parser.add_argument("--threshold", type=float, default=110)
    parser.add_argument("--padding", type=int, default=18)
    parser.add_argument("--outline", type=int, default=5)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    source = source.crop((0, 0, source.width, min(args.crop_bottom, source.height)))
    pixels = source.load()
    width, height = source.size

    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if background[offset] or white_distance(pixels[x, y]) > args.threshold:
            return
        background[offset] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    output = source.copy()
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                output_pixels[x, y] = (255, 255, 255, 0)

    # Reconstruct antialiased edge pixels that were originally blended onto white.
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if background[y * width + x]:
                continue
            touches_background = any(
                background[(y + dy) * width + (x + dx)]
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                if dx or dy
            )
            if not touches_background:
                continue

            pixel = pixels[x, y]
            distance = white_distance(pixel)
            if distance >= 230:
                continue

            alpha = max(1, min(255, round(distance / 230 * 255)))
            alpha_ratio = alpha / 255
            recovered = tuple(
                max(0, min(255, round((channel - 255 * (1 - alpha_ratio)) / alpha_ratio)))
                for channel in pixel[:3]
            )
            output_pixels[x, y] = (*recovered, alpha)

    alpha_box = output.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError("No foreground was found")

    left = max(0, alpha_box[0] - args.padding)
    top = max(0, alpha_box[1] - args.padding)
    right = min(width, alpha_box[2] + args.padding)
    bottom = min(height, alpha_box[3] + args.padding)
    output = output.crop((left, top, right, bottom))

    if args.outline > 0:
        filter_size = args.outline * 2 + 1
        expanded_alpha = output.getchannel("A").filter(ImageFilter.MaxFilter(filter_size))
        outline = Image.new("RGBA", output.size, (23, 17, 14, 0))
        outline.putalpha(expanded_alpha)
        output = Image.alpha_composite(outline, output)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, optimize=True)


if __name__ == "__main__":
    main()

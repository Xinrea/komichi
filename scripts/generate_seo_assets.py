#!/usr/bin/env python3
"""Generate deterministic social-sharing and app icon assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FONT = "/System/Library/Fonts/STHeiti Light.ttc"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size=size)


def make_og_image() -> None:
    canvas = Image.new("RGB", (1200, 630), "#e9dfc9")
    draw = ImageDraw.Draw(canvas)

    for x in range(0, 1200, 150):
        draw.line((x, 0, x, 630), fill="#d9ccb0", width=2)

    draw.rectangle((0, 0, 1200, 94), fill="#7b1018")
    for x in range(0, 1200, 85):
        draw.polygon(((x, 94), (x + 42, 128), (x + 85, 94)), fill="#a91f22")
    draw.polygon(((0, 0), (145, 0), (72, 630), (0, 630)), fill="#72131a")
    draw.polygon(((1200, 0), (1055, 0), (1128, 630), (1200, 630)), fill="#72131a")

    draw.text((160, 156), "よつじ こみち · YOTSUJI KOMICHI", font=font(24), fill="#4c3b32")
    draw.text((155, 208), "四时小路", font=font(82), fill="#17110e")
    draw.text((158, 300), "Komichi", font=font(78), fill="#a91f22")
    draw.text((160, 406), "凌晨四点，夜晚的十字路口。", font=font(32), fill="#17110e")
    draw.text((160, 465), "以普通 JK 身份活动的都市传说", font=font(23), fill="#625247")
    draw.rectangle((160, 528, 474, 574), fill="#72131a")
    draw.text((181, 537), "space.bilibili.com/1512246445", font=font(16), fill="#f1dfba")

    character = Image.open(ASSETS / "character-cutout.png").convert("RGBA")
    character.thumbnail((345, 550), Image.Resampling.LANCZOS)
    x = 800 + (300 - character.width) // 2
    y = 67 + (550 - character.height)
    canvas.paste(character, (x, y), character)
    draw.text((992, 590), "© VIRTUAREAL", font=font(13), fill="#6f5c4e")
    canvas.save(ASSETS / "og-image.png", optimize=True)


def make_icon(size: int, filename: str) -> None:
    image = Image.new("RGB", (size, size), "#160f0c")
    draw = ImageDraw.Draw(image)
    margin = round(size * 0.08)
    draw.ellipse((margin, margin, size - margin, size - margin), fill="#72131a", outline="#e8d5ab", width=max(2, size // 48))
    text_font = font(round(size * 0.5))
    box = draw.textbbox((0, 0), "K", font=text_font)
    draw.text(((size - (box[2] - box[0])) / 2, (size - (box[3] - box[1])) / 2 - box[1]), "K", font=text_font, fill="#f1dfba")
    image.save(ASSETS / filename, optimize=True)


if __name__ == "__main__":
    make_og_image()
    make_icon(180, "apple-touch-icon.png")
    make_icon(192, "icon-192.png")
    make_icon(512, "icon-512.png")

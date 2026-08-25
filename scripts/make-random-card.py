"""Builds the LOSOWA character card — the "surprise me" option in the character picker.

It is derived from a real card rather than drawn from nothing so that it sits in
a row of the other twenty-seven without looking pasted in: the frame, the teal,
the side labels and the title treatment all come from the scan. What it does NOT
keep is the part that makes a card that character — the illustration, the name,
the abilities and the printed Miecz/Magia values are all removed, because none
of them are known until the draw happens.

Needs Pillow, which the .mjs pipeline deliberately avoids; text rendering is the
one job not worth doing with a hand-rolled PNG encoder. Like every other asset
script the OUTPUT is committed, so nobody needs Pillow to run the app.

    python3 scripts/make-random-card.py
"""

from PIL import Image, ImageDraw, ImageFont

SOURCE = "assets/extracted/karta/karta-07.png"   # GOBLIN — chosen as the template
OUT_CARD = "public/cards/karta-random.jpg"
OUT_ART = "public/cards/art/karta-random.jpg"

SERIF = "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"

# Measured off the scan, not guessed. See the geometry notes in the commit.
TEAL = (16, 108, 140)
PANEL = (83, 82, 709, 896)        # the white field, left/top/right/bottom
TITLE_BAND = (0, 0, 791, 82)
MIECZ_DIGIT = (23, 317, 62, 351)  # the printed "3" beside Miecz
MAGIA_DIGIT = (23, 841, 62, 875)
MIECZ_INK = (226, 0, 0)
MAGIA_INK = (50, 18, 99)
OUTLINE = (255, 255, 255)

# Web sizes, matching scripts/export-card-images.mjs and export-card-art.mjs.
CARD_WIDTH = 629
ART = {"left": 0.1, "right": 0.9022, "top": 0.1447, "bottom": 0.5651}
QUALITY = 82


def outlined(draw, xy, text, font, fill, stroke, width, anchor="mm"):
    draw.text(xy, text, font=font, fill=fill, stroke_fill=stroke, stroke_width=width, anchor=anchor)


def tracked(draw, centre_x, y, text, font, fill, stroke, width, tracking):
    """Draws letterspaced text centred on `centre_x`. The printed titles are tracked."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = centre_x - total / 2
    for ch, w in zip(text, widths):
        outlined(draw, (x + w / 2, y), ch, font, fill, stroke, width)
        x += w + tracking


def rotated_glyph(text, font, fill, stroke, width):
    """Renders one glyph and turns it to match the card's bottom-to-top side text."""
    probe = Image.new("RGBA", (10, 10))
    box = ImageDraw.Draw(probe).textbbox((0, 0), text, font=font, stroke_width=width)
    pad = width * 2 + 4
    tile = Image.new("RGBA", (box[2] - box[0] + pad * 2, box[3] - box[1] + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text(
        (pad - box[0], pad - box[1]), text, font=font,
        fill=fill, stroke_fill=stroke, stroke_width=width,
    )
    return tile.rotate(-90, expand=True)


def place(card, tile, box):
    """Centres `tile` inside `box`, which is where the thing it replaces used to be."""
    cx = (box[0] + box[2]) // 2
    cy = (box[1] + box[3]) // 2
    card.paste(tile, (cx - tile.width // 2, cy - tile.height // 2), tile)


def build(mark_box, fill_ratio):
    card = Image.open(SOURCE).convert("RGB")
    draw = ImageDraw.Draw(card)

    # Strip the card back to its frame.
    draw.rectangle(PANEL, fill=(255, 255, 255))
    draw.rectangle(TITLE_BAND, fill=TEAL)

    # The name. Cap height and tracking are matched to the printed titles so this
    # reads as one of the set rather than as a label stuck on top of one.
    title_font = ImageFont.truetype(SERIF, 68)
    tracked(draw, card.width // 2, 46, "LOSOWA", title_font, (255, 255, 255), (0, 0, 0), 4, 3)

    # The printed values are Goblin's, so they go too — replaced by the same
    # question mark the illustration becomes.
    digit_font = ImageFont.truetype(SERIF, 44)
    draw.rectangle(MIECZ_DIGIT, fill=TEAL)
    draw.rectangle(MAGIA_DIGIT, fill=TEAL)
    place(card, rotated_glyph("?", digit_font, MIECZ_INK, OUTLINE, 3), MIECZ_DIGIT)
    place(card, rotated_glyph("?", digit_font, MAGIA_INK, OUTLINE, 3), MAGIA_DIGIT)

    # The illustration's replacement, sized to whatever box it has to live in.
    # The full card gives it the whole field; the thumbnail crop is a much
    # shallower rectangle, and a mark sized for the card loses its dot and half
    # its hook when cut down to that.
    mark(draw, mark_box, fill_ratio)
    return card


def fitted_font(height):
    """Largest size whose "?" is `height` tall. Point size and ink height differ a lot at this scale."""
    size = height
    for _ in range(24):
        font = ImageFont.truetype(SERIF, size)
        box = font.getbbox("?")
        drawn = box[3] - box[1]
        if drawn == 0:
            break
        size = round(size * height / drawn)
    return ImageFont.truetype(SERIF, size)


def mark(draw, box, fill_ratio):
    """Centres a red question mark in `box`, filling `fill_ratio` of its height."""
    font = fitted_font(round((box[3] - box[1]) * fill_ratio))
    draw.text(
        ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2),
        "?", font=font, fill=MIECZ_INK, anchor="mm",
    )


def art_box(card):
    return (
        round(card.width * ART["left"]), round(card.height * ART["top"]),
        round(card.width * ART["right"]), round(card.height * ART["bottom"]),
    )


def save_web():
    card = build(PANEL, 0.62)
    height = round(card.height * CARD_WIDTH / card.width)
    card.resize((CARD_WIDTH, height), Image.LANCZOS).save(OUT_CARD, quality=QUALITY)

    # Rebuilt rather than cropped, with the mark sized for the shallower box.
    thumb = build(art_box(card), 0.78)
    crop = thumb.crop((
        *art_box(thumb)[:2], *art_box(thumb)[2:],
    ))
    crop.resize((240, round(240 * crop.height / crop.width)), Image.LANCZOS).save(OUT_ART, quality=QUALITY)
    print(f"wrote {OUT_CARD} ({CARD_WIDTH}x{height}) and {OUT_ART} ({crop.size})")


if __name__ == "__main__":
    save_web()

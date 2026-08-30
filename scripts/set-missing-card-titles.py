"""Sets the fourteen Wyposażenie titles the box went to print without.

Ten cards on the *Wyposażenie i Zaklęcia* sheet and four on the *Wyposażenie*
one carry the template's own words in the title band — **NAZWA KARTY**, "card
name" — with the corner labels left as "Wyposażenie / Wyposażenie" instead of
the class and kind the finished cards print. The illustration and the rules
text are complete; only the name was never filled in. It is on the scans, so it
is on the printed sheets, and `src/data/raw/` records it verbatim because a
transcription that quietly corrected it would be a transcription you could not
check against the paper.

Thirteen of the fourteen never surface: every other Wyposażenie card is also in
the Karty Zdarzeń deck under the same id, and `cardImages.ts` walks the event
deck first, so the app already draws a properly titled printing of each. The
Tarcza Tolimana is the exception — the deck files its twin under a *different*
id, TARCZA BOGA TOLIMANA — so it is the one card in the game whose picture says
NAZWA KARTY. All fourteen are set anyway: the next thing to reach for a
Wyposażenie slice by name should not have to know which of them was lucky.

The name is *set*, not copied. Lifting the band off the event card would carry
its title across too, and TARCZA BOGA TOLIMANA is not what this card is called
— the shop card is TARCZA TOLIMANA, and 21.2's stock is counted under that
name. So the type is set here, in the sheet's own measurements:

  * the title sits on rows 57–81 of a 460-wide slice, cap height 25, centred —
    identical on every card of both sheets, template and finished alike;
  * the face is a Roman, and Times New Roman is the nearest the system has.
    It is *wider* than the sheet's: at equal cap height the printed
    „MAGICZNY MIECZ" measures 297 and Times measures 323, and two more samples
    agree within a percent. So the setting is condensed by the measured ratio
    rather than by eye, and `CONDENSE` is that number.

Like every other asset script here the output is committed, so nobody needs the
scans or Pillow to run the app — only to regenerate the pictures. Run it after
`export-card-images.mjs`, which is what it overwrites:

    node scripts/export-card-images.mjs && python3 scripts/set-missing-card-titles.py

Reads the full-resolution slice and hands the JPEG to the same `sips` call the
export uses, rather than repainting the finished JPEG — one encode, and the set
name is upscaled by exactly what the printed text around it is.
"""

import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
EXTRACTED = ROOT / "assets/extracted"
OUT = ROOT / "public/cards"

SERIF = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"

# What the box prints where a name should be.
PLACEHOLDER = "NAZWA KARTY"

# Measured off the scans, at the slice's own 460x768. The band is the same on
# every card of both sheets, which is what makes one set of numbers enough.
SLICE_WIDTH = 460
TITLE_TOP, TITLE_BOTTOM = 57, 81
# Cleared before setting: the corner labels end at row 30 and the illustration
# frame begins at 108 at the earliest, so this reaches neither.
CLEAR_TOP, CLEAR_BOTTOM = 40, 100

# Times at equal cap height against the printed titles: 297/323 on „MAGICZNY
# MIECZ", and the same to within a percent on „TARCZA BOGA TOLIMANA" and
# „TARCZA". The sheet's face is simply narrower.
CONDENSE = 0.92
# Nothing is set wider than this much of the card, however long the name.
MAX_WIDTH = 0.90
# Type is set large and brought down, so the curves survive the condensing.
OVERSAMPLE = 8

# The export's own numbers — see `export-card-images.mjs`. Kept in step by hand
# because this script writes the same files, and a mismatch would show as one
# card in a row rendering at a different size or sharpness.
WEB_WIDTH = 880
QUALITY = 72


def missing_titles():
    """Every slice the box left the template on, and what the card is called."""
    items = json.loads((ROOT / "src/data/items.json").read_text())
    sheets = {
        name: json.loads((ROOT / f"src/data/raw/{name}.json").read_text())
        for name in ("wyposazenie", "wyposazenie-zaklecia")
    }
    seen = set()
    for item in items:
        sheet, index = item["source"]["sheet"], item["source"]["index"]
        if (sheet, index) in seen:
            continue
        seen.add((sheet, index))
        if sheets[sheet][index - 1]["name"] == PLACEHOLDER:
            yield sheet, index, item["name"]


def set_title(card: Image.Image, name: str) -> Image.Image:
    """Whites out the template's words and sets the card's own in their place."""
    width, _ = card.size
    scale = width / SLICE_WIDTH
    cap = (TITLE_BOTTOM - TITLE_TOP + 1) * scale

    draw = ImageDraw.Draw(card)
    draw.rectangle(
        [0, CLEAR_TOP * scale, width, CLEAR_BOTTOM * scale],
        fill=255,
    )

    # Set big, then bring it down: `ImageFont` sizes by em, and an em says
    # nothing about how tall a capital stands in a given face.
    font = ImageFont.truetype(SERIF, int(cap * OVERSAMPLE))
    big = Image.new("L", (int(width * OVERSAMPLE * 2), int(cap * OVERSAMPLE * 4)), 255)
    baseline = big.height * 2 / 3
    ImageDraw.Draw(big).text((big.width / 2, baseline), name, font=font, fill=0, anchor="ms")
    ink = big.point(lambda v: 255 if v < 128 else 0).getbbox()
    if ink is None:
        raise SystemExit(f"nothing was set for {name!r}")

    lettering = big.crop(ink)

    # Scaled by the *cap* height and not by the ink, which is the whole reason
    # the ogonek is measured separately: RĘKAWICE is exactly as tall as ZBROJA
    # in print, and scaling the two by their ink boxes set one of them smaller
    # than the other to make room for the tail on the Ę.
    letter = Image.new("L", big.size, 255)
    ImageDraw.Draw(letter).text((big.width / 2, baseline), "H", font=font, fill=0, anchor="ms")
    caps = letter.point(lambda v: 255 if v < 128 else 0).getbbox()
    factor = cap / (caps[3] - caps[1])

    long = lettering.width * factor * CONDENSE
    room = width * MAX_WIDTH
    if long > room:
        factor *= room / long
        long = room
    lettering = lettering.resize(
        (max(1, round(long)), max(1, round(lettering.height * factor))), Image.LANCZOS
    )

    # Placed by the baseline, so a tail below it hangs where the face puts it
    # instead of pushing the capitals up out of the band.
    sits = (TITLE_BOTTOM + 1) * scale - (baseline - ink[1]) * factor
    card.paste(lettering, (round((width - lettering.width) / 2), round(sits)), None)
    return card


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, index, name in missing_titles():
        slice_id = f"{sheet}-{index:02d}"
        source = EXTRACTED / sheet / f"{slice_id}.png"
        if not source.exists():
            raise SystemExit(
                f"{source} is missing — run `node scripts/extract-assets.mjs` first."
            )
        card = set_title(Image.open(source).convert("L"), name)
        with tempfile.NamedTemporaryFile(suffix=".png") as handle:
            card.save(handle.name)
            subprocess.run(
                [
                    "sips",
                    "-s", "format", "jpeg",
                    "-s", "formatOptions", str(QUALITY),
                    "-Z", str(WEB_WIDTH),
                    handle.name,
                    "--out", str(OUT / f"{slice_id}.jpg"),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        print(f"{slice_id}: {name}")


if __name__ == "__main__":
    main()

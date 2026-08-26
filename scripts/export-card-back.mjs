/** Cuts the back of each pile out of the sheet that carries it. */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * Three backs, from two quite different places.
 *
 * The ZDARZENIE back was in the box's own scans all along, filed where nobody
 * would look: the five of them share sheet 9's reverse with the Zamieniony w
 * Kamień cards, the Dobry/Zły markers and the standees. Everything printed on
 * one side of one sheet, which is how a print run works and not how a box is
 * organised — so there is no "Karty Zdarzeń (tyły)" file to go looking for.
 *
 * The other two were not in the archive at all, on Drive or in the mirror of
 * it. They came off the community's `oficjalne.rar`, which has a `rewersy/`
 * folder the Drive copy does not — twenty ZAKLĘCIE backs to a sheet and twenty
 * WYPOSAŻENIE, both at the same 2480x3508 as everything else here. See
 * CLAUDE.md for where that archive lives.
 *
 * `Wyposarzenie` is the archive's own spelling, kept because renaming a source
 * file is how a path stops matching the thing it came from.
 *
 * The boxes are fractions of the page rather than pixels, and they were
 * measured rather than guessed: `_findcard.mjs` finds the printed area, divides
 * it into the sheet's grid, and reads the pale frame line off the first cell.
 * Guessing put the frame on the crop instead of inside it, which shows as a
 * card with one corner sliced off.
 */
const BACKS = [
  {
    id: "zdarzenie",
    sheet:
      "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
      "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony (tyły).pdf",
    card: { left: 0.0255, top: 0.0245, right: 0.2145, bottom: 0.2285 },
  },
  {
    id: "zaklecie",
    sheet: "assets/raw/MM - Magiczny Miecz/Rewersy/Zaklęcie rewersy.pdf",
    card: { left: 0.0347, top: 0.0245, right: 0.2048, bottom: 0.2343 },
  },
  {
    id: "wyposazenie",
    sheet: "assets/raw/MM - Magiczny Miecz/Rewersy/Wyposarzenie Rewersy.jpg",
    card: { left: 0.0331, top: 0.0219, right: 0.2056, bottom: 0.232 },
  },
];

/** Wide enough for the largest place a back is drawn — a pile in the Talie view. */
const WIDTH = 460;

for (const { id, sheet, card } of BACKS) {
  if (!fs.existsSync(sheet)) {
    console.warn(`skipped ${id} — no ${sheet}`);
    continue;
  }

  // Straight from the JPEG where there is one; through sips for the PDFs, which
  // sharp cannot open.
  let source = sheet;
  const rendered = sheet.toLowerCase().endsWith(".pdf");
  if (rendered) {
    source = `/tmp/mm-back-${id}.png`;
    execFileSync(
      "sips",
      ["-s", "format", "png", "--resampleWidth", "2480", sheet, "--out", source],
      { stdio: "ignore" },
    );
  }

  const { width, height } = await sharp(source).metadata();
  const box = {
    left: Math.round(width * card.left),
    top: Math.round(height * card.top),
    width: Math.round(width * (card.right - card.left)),
    height: Math.round(height * (card.bottom - card.top)),
  };

  const out = `public/cards/back-${id}.jpg`;
  fs.mkdirSync("public/cards", { recursive: true });
  await sharp(source).extract(box).resize({ width: WIDTH }).jpeg({ quality: 88 }).toFile(out);
  if (rendered) fs.rmSync(source, { force: true });

  const made = await sharp(out).metadata();
  console.log(`${out} — ${made.width}x${made.height} from ${width}x${height}`);
}

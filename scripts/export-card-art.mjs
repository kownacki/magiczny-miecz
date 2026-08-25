/** Cuts the illustration out of every card, for use as an icon where a whole card will not fit. */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { decodePng, encodePng, cropImage } from "./lib/png.mjs";

/**
 * Every card in this box is the same object: a header, a title, a framed
 * illustration, and a block of text. Only the illustration is any use at icon
 * size — the title is four pixels tall and the text is a grey rectangle — so
 * this cuts it out and leaves the rest.
 *
 * The frame is in the same place on all of them. Measured across 236 cards from
 * all twelve event, spell and equipment sheets by finding the printed rules
 * that bound it: the top and bottom lines land at 14.47% and 56.51% of the
 * card's height, the left and right at 10.00% and 90.22% of its width, and the
 * spread across the whole sample is under half a percent. On a native 461x768
 * slice that is 370 by 323 pixels.
 *
 * The four cards it does not fit are the Dobry/Zły markers, which have no
 * illustration at all. They are skipped rather than cropped to a blank.
 */
const ART = { left: 0.1, right: 0.9022, top: 0.1447, bottom: 0.5651 };

const IN = "assets/extracted";
const OUT = "public/cards/art";

/** Sheets with cards on them. The standees are their own picture already. */
const CARD_SHEETS = /^(zdarzenia-\d|zaklecia|wyposazenie|wyposazenie-zaklecia|karta)$/;

/** Twice the biggest slot it is drawn in, so it stays sharp on a retina screen. */
const WIDTH = 240;
const QUALITY = 72;

/**
 * Cards with no illustration to cut out.
 *
 * The Dobry/Zły markers are a word in a box. Cropping to where an illustration
 * would be gives an empty rectangle, which is worse than falling back to the
 * whole card.
 */
function hasArt(img) {
  const top = Math.round(img.height * ART.top);
  const bottom = Math.round(img.height * ART.bottom);
  const left = Math.round(img.width * ART.left);
  const right = Math.round(img.width * ART.right);
  let ink = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 3) {
    for (let x = left; x < right; x += 3) {
      const i = (y * img.width + x) * img.comps;
      const l =
        img.comps === 1
          ? img.data[i]
          : (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      if (l < 128) ink++;
      total++;
    }
  }
  // A framed illustration is at least a tenth ink; an empty box is the frame.
  return ink / total > 0.1;
}

function run() {
  if (!fs.existsSync(IN)) {
    console.error(`${IN} is missing — run scripts/extract-assets.mjs first.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mm-art-"));

  let written = 0;
  let skipped = 0;
  let bytes = 0;
  const manifest = [];

  for (const sheet of fs.readdirSync(IN).sort()) {
    if (!CARD_SHEETS.test(sheet)) continue;
    const dir = path.join(IN, sheet);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir).sort()) {
      const match = file.match(/^(.+)-(\d+)\.png$/);
      if (!match) continue;
      const [, sheetId, index] = match;

      const img = decodePng(fs.readFileSync(path.join(dir, file)));
      if (!hasArt(img)) {
        skipped++;
        continue;
      }

      const x = Math.round(img.width * ART.left);
      const y = Math.round(img.height * ART.top);
      const w = Math.round(img.width * ART.right) - x;
      const h = Math.round(img.height * ART.bottom) - y;

      const temp = path.join(scratch, `${sheetId}-${index}.png`);
      fs.writeFileSync(temp, encodePng(cropImage(img, x, y, w, h)));

      const destination = path.join(OUT, `${sheetId}-${index}.jpg`);
      execFileSync(
        "sips",
        ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY), "-Z", String(WIDTH), temp, "--out", destination],
        { stdio: "ignore" },
      );
      bytes += fs.statSync(destination).size;
      manifest.push(`${sheetId}#${Number(index)}`);
      written++;
    }
  }

  fs.rmSync(scratch, { recursive: true, force: true });
  // Which slices have an illustration, so the browser can fall back to the
  // whole card for the four that do not rather than asking for a missing file.
  fs.writeFileSync("src/data/card-art.json", JSON.stringify(manifest.sort(), null, 0) + "\n");
  console.log(
    `${written} illustrations, ${(bytes / 1024 / 1024).toFixed(1)} MB -> ${OUT}` +
      (skipped ? ` (${skipped} cards have no illustration)` : ""),
  );
}

run();

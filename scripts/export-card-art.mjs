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
// Not `karta`: a Karta Postaci already has its picture printed on a card of
// its own — the standee — so cutting a rectangle out of the big one produced
// 28 files that were the illustration plus a slice of the Charakterystyka, and
// nothing wanted them. See `characterArtUrl`.
const CARD_SHEETS = /^(zdarzenia-\d|zaklecia|wyposazenie|wyposazenie-zaklecia)$/;

/** Twice the biggest slot it is drawn in, so it stays sharp on a retina screen. */
const WIDTH = 240;
const QUALITY = 72;

/**
 * One shape per family, forced.
 *
 * The crop above is a *fraction* of each slice, so its output is only as
 * uniform as the slicing is — and it is not. Cards came out 240x209 mostly,
 * 240x210 often, and anywhere from 240x200 to 240x214 on zdarzenia-9, whose
 * slices wobble. Karty Postaci are a different card entirely and come out
 * 240x155.
 *
 * That was invisible here and expensive downstream: every slot in the app draws
 * art in a box of one fixed shape, so a picture of another shape is silently
 * cropped to fit. The box had been built to the Karta Postaci's 240x155 while
 * 225 of the 264 pictures were 240x209 — a quarter of every item illustration's
 * height, cut off and never missed because nobody had seen the whole one.
 *
 * So the aspect is settled here, once, where the pictures are made. Cropped to
 * the target ratio about the centre and then resized to it exactly, which
 * trims a few pixels off the stragglers and distorts nothing.
 */
const SHAPE = {
  /** Karty Zdarzeń, Zaklęcia and Wyposażenie: the frame is 80.2% by 42.0%. */
  karta_zdarzen: { width: WIDTH, height: 209 },
  /** Karty Postaci are taller and wider, and their frame is a different one. */
  karta_postaci: { width: WIDTH, height: 155 },
};

/** The largest rectangle of `ratio` that fits inside w x h, centred. */
function centreCrop(width, height, ratio) {
  const wide = width / height > ratio;
  const w = wide ? Math.round(height * ratio) : width;
  const h = wide ? height : Math.round(width / ratio);
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h };
}

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
      const art = cropImage(img, x, y, w, h);

      // Then to the one shape its family is drawn in — see SHAPE.
      const shape = sheet === "karta" ? SHAPE.karta_postaci : SHAPE.karta_zdarzen;
      const fit = centreCrop(art.width, art.height, shape.width / shape.height);

      const temp = path.join(scratch, `${sheetId}-${index}.png`);
      fs.writeFileSync(temp, encodePng(cropImage(art, fit.x, fit.y, fit.w, fit.h)));

      const destination = path.join(OUT, `${sheetId}-${index}.jpg`);
      // `-z height width` is an exact resize. The crop above already made the
      // ratio right, so nothing is stretched by asking for it.
      execFileSync(
        "sips",
        ["-s", "format", "jpeg", "-s", "formatOptions", String(QUALITY),
         "-z", String(shape.height), String(shape.width), temp, "--out", destination],
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

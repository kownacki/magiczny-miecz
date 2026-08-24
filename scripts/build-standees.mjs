/** Cuts the małe Karty Postaci to one size, so 27 of them sit in a row without wobbling. */

import fs from "node:fs";
import path from "node:path";
import { decodePng, encodePng } from "./lib/png.mjs";

/**
 * The small cards come off two sheets and the generic slicer cuts them badly.
 *
 * It finds gutters, and the gutters between these cards are teal rather than
 * printed rules, so the cut lands wherever the teal happens to be widest — the
 * slices come out anywhere from 432 to 461 wide and 737 to 768 tall, with some
 * cards flush against an edge and others swimming in margin. Laid out in a
 * strip they visibly jitter, and the card that is flush to the edge looks
 * cropped.
 *
 * The cards themselves are 401x708 to within three pixels, every one of them,
 * because they are the same object printed twenty-seven times. So this ignores
 * where the slicer cut and finds the card: everything that is not the teal
 * ground is the card, and the card is then centred on one canvas of one size
 * with the same teal all round it.
 */
const SOURCES = [
  // The Piony Postaci sheet: the first twenty, alphabetical.
  ...Array.from({ length: 20 }, (_, i) => `piony/piony-${pad(i + 1)}.png`),
  // The rest were tacked onto the end of Zdarzenia 9, after the Dobry/Zły
  // markers, in the same alphabetical order.
  ...Array.from({ length: 7 }, (_, i) => `zdarzenia-9/zdarzenia-9-${pad(i + 14)}.png`),
];

const IN = "assets/extracted";
const OUT = path.join(IN, "standee");

/** Teal all round, wide enough that the printed frame never touches an edge. */
const MARGIN = 20;

/**
 * How far a pixel may stray from the ground colour and still count as ground.
 *
 * Generous, because a scan of a flat colour is never flat: JPEG ringing along
 * the card's black frame puts pixels tens of levels off the mean. Too tight and
 * the "card" bounding box grows to the whole slice, which is exactly the
 * mis-cut this exists to undo.
 */
const TOLERANCE = 60;

function pad(n) {
  return String(n).padStart(2, "0");
}

function pixel(img, x, y) {
  const i = (y * img.width + x) * img.comps;
  if (img.comps === 1) return [img.data[i], img.data[i], img.data[i]];
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** The card within the slice: everything that is not the ground colour. */
function cardBounds(img) {
  const ground = pixel(img, 2, 2);
  const isGround = (p) =>
    Math.abs(p[0] - ground[0]) + Math.abs(p[1] - ground[1]) + Math.abs(p[2] - ground[2]) <
    TOLERANCE;

  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isGround(pixel(img, x, y))) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("no card found — the whole slice is background");
  return { ground, x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** The card, centred on a ground-coloured canvas of exactly `width` x `height`. */
function onCanvas(img, bounds, width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = bounds.ground[0];
    data[i * 3 + 1] = bounds.ground[1];
    data[i * 3 + 2] = bounds.ground[2];
  }
  const left = Math.round((width - bounds.width) / 2);
  const top = Math.round((height - bounds.height) / 2);
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const [r, g, b] = pixel(img, bounds.x0 + x, bounds.y0 + y);
      const d = ((top + y) * width + left + x) * 3;
      data[d] = r;
      data[d + 1] = g;
      data[d + 2] = b;
    }
  }
  return { width, height, comps: 3, data };
}

function run() {
  const loaded = SOURCES.map((relative) => {
    const file = path.join(IN, relative);
    if (!fs.existsSync(file)) {
      console.error(`missing: ${file} — run scripts/extract-assets.mjs first.`);
      process.exit(1);
    }
    const img = decodePng(fs.readFileSync(file));
    return { relative, img, bounds: cardBounds(img) };
  });

  // One canvas for all of them, sized to the largest card found rather than to
  // a number written here: the scans are what they are, and a hard-coded size
  // that stopped fitting would crop a card rather than say so.
  const width = Math.max(...loaded.map((s) => s.bounds.width)) + MARGIN * 2;
  const height = Math.max(...loaded.map((s) => s.bounds.height)) + MARGIN * 2;

  fs.mkdirSync(OUT, { recursive: true });
  loaded.forEach((source, i) => {
    const out = onCanvas(source.img, source.bounds, width, height);
    fs.writeFileSync(path.join(OUT, `standee-${pad(i + 1)}.png`), encodePng(out));
  });

  const sizes = new Set(loaded.map((s) => `${s.bounds.width}x${s.bounds.height}`));
  console.log(
    `${loaded.length} standees -> ${OUT} @ ${width}x${height}` +
      ` (cards found: ${[...sizes].join(", ")})`,
  );
}

run();

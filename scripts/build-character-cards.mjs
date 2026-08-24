/** Cuts both Karty Postaci — the big one and the small one — to one size each. */

import fs from "node:fs";
import path from "node:path";
import { decodePng, encodePng, cropImage } from "./lib/png.mjs";
import { extractImages } from "./lib/pdf-images.mjs";

/**
 * The generic slicer cuts these two sheets badly, for opposite reasons.
 *
 * It looks for dark gutters. On the Piony Postaci sheet the gutters are teal
 * and it finds them, but only roughly: the cut lands wherever the teal happens
 * to be widest, so slices came out 432–461 wide and 737–768 tall, some cards
 * flush against an edge and others swimming in margin.
 *
 * On the Postacie sheets it fails outright, because the *card itself* is a teal
 * rectangle — the bands carrying Miecz, Magia, Złoto and Życie are printed on
 * it — and the cards butt together with no gutter at all. So the slicer cut
 * through them: Goblin lost the top of its title, Kat had a strip of Łotr along
 * the bottom.
 *
 * Neither is really a cutting problem. Both sheets are perfectly regular grids
 * of one object printed over and over, so this measures the block and divides
 * it, then trims each card to itself and centres it on one canvas of one size.
 */
const RAW = "assets/raw/MM - Magiczny Miecz";
const IN = "assets/extracted";

/** Ground all round, wide enough that the printed edge never touches the border. */
const MARGIN = 20;

/**
 * How far a pixel may stray from the ground colour and still count as ground.
 *
 * Generous, because a scan of a flat colour is never flat: JPEG ringing along a
 * printed edge puts pixels tens of levels off the mean. Too tight and the
 * bounding box grows to the whole cell, which is the mis-cut this exists to
 * undo.
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

function apart(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** The card within a cell: everything that is not the colour in the corner. */
function cardBounds(img) {
  const ground = pixel(img, 2, 2);
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (apart(pixel(img, x, y), ground) < TOLERANCE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("no card found — the whole cell is background");
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

/**
 * Writes a set of cards, all the same size.
 *
 * `trim` finds each card inside its cell and re-centres it, which is what the
 * standees need: their slices are ragged, but each holds exactly one card on a
 * plain ground, so the card can be picked out and re-framed.
 *
 * The big cards are cut from a regular grid instead and are already uniform by
 * construction — every cell is the same size and the card sits in the same
 * place in it. Trimming them made things worse, not better: the cards butt
 * together, so a cell's corner is sometimes card rather than ground, and the
 * search then finds the white inner face and throws the teal border away.
 */
function writeSet(id, cells, { trim = true } = {}) {
  const bounded = cells.map((img) => ({
    img,
    bounds: trim
      ? cardBounds(img)
      : { ground: pixel(img, 2, 2), x0: 0, y0: 0, width: img.width, height: img.height },
  }));
  // Sized to the largest card found rather than to a number written here: the
  // scans are what they are, and a hard-coded size that stopped fitting would
  // crop a card rather than say so.
  const border = trim ? MARGIN * 2 : 0;
  const width = Math.max(...bounded.map((b) => b.bounds.width)) + border;
  const height = Math.max(...bounded.map((b) => b.bounds.height)) + border;

  const dir = path.join(IN, id);
  fs.mkdirSync(dir, { recursive: true });
  bounded.forEach((entry, i) => {
    fs.writeFileSync(
      path.join(dir, `${id}-${pad(i + 1)}.png`),
      encodePng(onCanvas(entry.img, entry.bounds, width, height)),
    );
  });

  const sizes = new Set(bounded.map((b) => `${b.bounds.width}x${b.bounds.height}`));
  console.log(
    `${id}: ${cells.length} cards @ ${width}x${height}` +
      (trim ? ` (found ${[...sizes].join(", ")})` : ` (cells ${[...sizes].join(", ")})`),
  );
}

function read(relative) {
  const file = path.join(IN, relative);
  if (!fs.existsSync(file)) {
    console.error(`missing: ${file} — run scripts/extract-assets.mjs first.`);
    process.exit(1);
  }
  return decodePng(fs.readFileSync(file));
}

/**
 * The nine big cards on one Postacie sheet.
 *
 * The page is a white margin around one dark block of nine cards, and the cards
 * fill it exactly — 2371 by 2943 on every sheet, which divides by three without
 * remainder in the direction that matters. So the block is found by asking
 * where the page stops being white, and then simply divided.
 */
function bigCardsFrom(pdf) {
  const page = extractImages(fs.readFileSync(path.join(RAW, pdf)))[0];
  const paper = pixel(page, 4, 4);
  const dense = (fixed, along, get) => {
    const hits = [];
    for (let i = 0; i < fixed; i++) {
      let ink = 0;
      let total = 0;
      // Every fourth pixel is plenty to tell the block from the paper.
      for (let j = 0; j < along; j += 4) {
        if (apart(get(i, j), paper) >= TOLERANCE) ink++;
        total++;
      }
      hits.push(ink / total > 0.5);
    }
    const first = hits.indexOf(true);
    const last = hits.lastIndexOf(true);
    return [first, last - first + 1];
  };
  const [bx, bw] = dense(page.width, page.height, (x, y) => pixel(page, x, y));
  const [by, bh] = dense(page.height, page.width, (y, x) => pixel(page, x, y));

  const cells = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = bx + Math.round((col * bw) / 3);
      const y = by + Math.round((row * bh) / 3);
      const w = bx + Math.round(((col + 1) * bw) / 3) - x;
      const h = by + Math.round(((row + 1) * bh) / 3) - y;
      cells.push(cropImage(page, x, y, w, h));
    }
  }
  return cells;
}

function run() {
  // The małe Karty Postaci: twenty on their own sheet in alphabetical order,
  // and the last seven tacked onto the end of Zdarzenia 9 after the Dobry/Zły
  // markers. Those slices are cut well enough to trim from.
  writeSet("standee", [
    ...Array.from({ length: 20 }, (_, i) => read(`piony/piony-${pad(i + 1)}.png`)),
    ...Array.from({ length: 7 }, (_, i) => read(`zdarzenia-9/zdarzenia-9-${pad(i + 14)}.png`)),
  ]);

  writeSet(
    "karta",
    [
      ...bigCardsFrom("Postacie/MM - MAGICZNY MIECZ - Postacie 1.pdf"),
      ...bigCardsFrom("Postacie/MM - MAGICZNY MIECZ - Postacie 2.pdf"),
      ...bigCardsFrom("Postacie/MM - MAGICZNY MIECZ - Postacie 3.pdf"),
    ],
    { trim: false },
  );
}

run();

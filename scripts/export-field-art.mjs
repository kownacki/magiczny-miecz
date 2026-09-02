/** Finds the biggest patch of unobscured painting in every field's square, and cuts it out. */

import fs from "node:fs";
import path from "node:path";
import { encodePng } from "./lib/png.mjs";
import { BOARD, loadBoard, scrapMask } from "./lib/parchment.mjs";
import boxes from "../src/data/field-text-boxes.json" with { type: "json" };

/**
 * The board is one continuous painting with 57 torn-parchment scraps printed on
 * top of it, and every field wants a picture of itself. The scrap is in the way:
 * a field's square cropped whole is a third instruction text, and the app draws
 * these small, where a page of unreadable four-pixel lettering is worse than no
 * picture at all.
 *
 * So each field gets the largest axis-aligned rectangle inside its own cell that
 * touches no parchment. That is a smaller picture than the cell, sometimes much
 * smaller, but every pixel of it is painting.
 *
 * Two things this deliberately does not do.
 *
 * It does not exclude a neighbour's artwork. The cell grid was ruled on top of
 * a finished picture, so the hillside behind Wilczy Parów runs on into Kamienny
 * Las and the Zamek's own towers lean over the field beside it. Cropping to what
 * "belongs" to a field would mean deciding where a painted hill ends, which is
 * not a decision anyone can check. The window sits anywhere inside the cell and
 * takes whatever the painter put there.
 *
 * And it fills in nothing. No inpainting, no smoothing the parchment away, not
 * even where a two-pixel spur of a torn edge costs a field half its window.
 * Every pixel written here is a pixel off the scan, so a picture that looks
 * wrong is the board being odd rather than this script being clever.
 */

const CELLS = "src/data/field-cells.json";
const WINDOWS = "src/data/field-art-windows.json";
const OUT = "assets/extracted/field-art";

/**
 * Where the FieldId union really lives.
 *
 * `board.ts` and `rings.ts` hold the four ring arrays the type is derived from,
 * and a `.mjs` script cannot import them. Reading the literals back out with a
 * regex is what `build-ring-fields.mjs` already does for the same reason, and it
 * buys the check that matters here: a field the survey silently skipped is a
 * field the app will ask for a picture of and not get one.
 */
const RING_SOURCES = ["src/lib/engine/board.ts", "src/lib/engine/rings.ts"];

function fieldIds() {
  const ids = [];
  for (const source of RING_SOURCES) {
    const text = fs.readFileSync(source, "utf8");
    for (const match of text.matchAll(/\{ id: "([^"]+)", name: "[^"]+", region: "[^"]+"/g)) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * The largest rectangle inside `cell` that the mask never marks.
 *
 * The textbook largest-rectangle-in-a-binary-matrix: keep, per column, how many
 * clean rows run up to the current one, and that histogram's largest rectangle —
 * found with the monotonic stack — is the largest rectangle ending at this row.
 * Linear in the cell's area, which is the reason it is run at the scan's own
 * resolution rather than on downsampled blocks. The whole board is 33 million
 * pixels and every cell is visited once, so the cost of exactness here is a
 * couple of seconds, and what it buys is a window measured in the same pixels
 * everything else on this board is measured in — no block size to round the
 * answer out to, and no scaling back up that could put a rounded edge back over
 * the parchment it was found to avoid.
 *
 * The mask handed in is the whole board's, never a crop. A scrap belonging to
 * the field next door regularly overhangs the boundary, and the window has to
 * dodge that one exactly as it dodges its own.
 */
function largestCleanWindow(mask, boardWidth, cell) {
  const width = cell.x1 - cell.x0;
  const height = cell.y1 - cell.y0;
  // One extra column, held at zero, so the sweep's final pass drains the stack
  // without a special case for the right-hand edge.
  const runs = new Int32Array(width + 1);
  const stack = new Int32Array(width + 1);
  let best = { x: cell.x0, y: cell.y0, w: 0, h: 0 };
  let bestArea = 0;

  for (let y = 0; y < height; y++) {
    const row = (cell.y0 + y) * boardWidth + cell.x0;
    for (let x = 0; x < width; x++) runs[x] = mask[row + x] ? 0 : runs[x] + 1;

    let sp = 0;
    for (let x = 0; x <= width; x++) {
      const run = runs[x];
      while (sp > 0 && runs[stack[sp - 1]] >= run) {
        const top = stack[--sp];
        const tall = runs[top];
        const left = sp > 0 ? stack[sp - 1] + 1 : 0;
        const wide = x - left;
        if (tall * wide > bestArea) {
          bestArea = tall * wide;
          best = { x: cell.x0 + left, y: cell.y0 + y - tall + 1, w: wide, h: tall };
        }
      }
      stack[sp++] = x;
    }
  }
  return { ...best, area: bestArea, cellArea: width * height };
}

/**
 * A straight RGB copy of one rectangle of the board.
 *
 * `cropImage` would keep whatever `comps` the scan decoded as; these are wanted
 * as plain RGB with no alpha, because unlike the scrap cut-outs there is nothing
 * transparent about a rectangle of painting.
 */
function cutRgb(img, { x, y, w, h }) {
  const data = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const from = ((y + j) * img.width + (x + i)) * img.comps;
      const to = (j * w + i) * 3;
      data[to] = img.data[from];
      data[to + 1] = img.data[from + 1];
      data[to + 2] = img.data[from + 2];
    }
  }
  return { width: w, height: h, comps: 3, data };
}

function run() {
  const ids = fieldIds();
  const { cells } = JSON.parse(fs.readFileSync(CELLS, "utf8"));
  const byId = new Map(cells.map((cell) => [cell.id, cell]));

  const missing = ids.filter((id) => !byId.has(id));
  const extra = cells.map((cell) => cell.id).filter((id) => !ids.includes(id));
  if (missing.length || extra.length) {
    console.error(`${CELLS} does not match the board:`);
    for (const id of missing) console.error(`  no cell for ${id}`);
    for (const id of extra) console.error(`  ${id} is not a field`);
    process.exit(1);
  }

  const img = loadBoard();
  // Once, for the whole board — see largestCleanWindow. The text boxes are the
  // mask's seeds: it grows the scraps outward from inside them rather than
  // guessing at them by colour, so the survey is only as complete as that file.
  const mask = scrapMask(img, boxes.boxes);
  fs.mkdirSync(OUT, { recursive: true });

  const found = ids.map((id) => {
    const cell = byId.get(id);
    const window = largestCleanWindow(mask, img.width, cell);
    if (window.w > 0 && window.h > 0) {
      fs.writeFileSync(path.join(OUT, `${id}.png`), encodePng(cutRgb(img, window)));
    } else {
      console.error(`  ${id}: no clean pixel anywhere in the cell, so no picture`);
    }
    return {
      id,
      x: window.x,
      y: window.y,
      w: window.w,
      h: window.h,
      percent: Number(((window.area / window.cellArea) * 100).toFixed(1)),
    };
  });

  // Worst first, so the file reads as a ranking: the fields at the top are the
  // ones whose scrap swallows their square, and they are the ones worth looking
  // at before trusting a picture of them.
  found.sort((a, b) => a.percent - b.percent || a.id.localeCompare(b.id));

  const notes = {
    source: `${BOARD}, ${img.width}x${img.height}, the scan at native size`,
    what: "the largest axis-aligned rectangle inside a field's cell that holds no parchment scrap, so it is all painting",
    cells: `${CELLS}; percent is the window's area as a share of that cell's`,
    parchment: "scrapMask() in scripts/lib/parchment.mjs, flood-filled outward from the 57 boxes in src/data/field-text-boxes.json, over the whole board at once — a neighbour's scrap overhanging this cell is avoided too",
    neighbours: "not cropped out: the board is one painting and the grid was ruled over it, so a window may hold artwork belonging to the field next door",
    units: "board pixels; x, y is the top-left corner and the cut is one output pixel per board pixel",
    order: "worst first — the smallest share of its cell leads",
  };
  fs.writeFileSync(
    WINDOWS,
    JSON.stringify({ $windows: notes, windows: found }, null, 1) + "\n",
  );

  const percents = found.map((entry) => entry.percent);
  const median = percents[Math.floor(percents.length / 2)];
  const say = (entry) => `${entry.id} ${entry.percent}% (${entry.w}x${entry.h})`;
  console.log(`${found.length} fields -> ${OUT}, windows -> ${WINDOWS}`);
  console.log(`median ${median}% of the cell`);
  console.log(`worst:  ${found.slice(0, 5).map(say).join(", ")}`);
  console.log(`best:   ${found.slice(-5).reverse().map(say).join(", ")}`);
}

run();

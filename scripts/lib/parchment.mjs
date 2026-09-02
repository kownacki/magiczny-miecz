/** Separates the printed parchment scraps from the painting they are printed on. */

import fs from "node:fs";
import { decodePng } from "./png.mjs";

export const BOARD = "assets/extracted/board/board.png";

/**
 * The board is a continuous painting with 57 torn-parchment scraps printed over
 * it, each carrying one Obszar's instruction. Everything in this file exists to
 * draw the line between the two, because both halves are wanted: the scrap is
 * the printed text, and its complement is the artwork underneath.
 *
 * **Brightness alone does not find them, and it is worth saying why.** The paper
 * is pure white and unsaturated, and so is a great deal of the painting: snow,
 * cloud, the grey slabs of the Kamienny Most, and every highlight. Measured over
 * the whole scan, 23% of the board passes a threshold tight enough to throw away
 * a third of the real paper. A first attempt thresholded and filled holes, and
 * called 53.7% of the board parchment.
 *
 * So the scraps are found in three steps, and each one is there because the step
 * before it was not enough.
 *
 * 1. `CORE` is deliberately far tighter than paper needs — the paper reads 249
 *    to 252 and the pale artwork beside it reads 200 to 225, so a bar at 238
 *    lands in the gap. It costs the scrap's own shaded edges, which step 3 gives
 *    back.
 * 2. Only paper within `REACH` of *lettering* may seed a fill. This is what
 *    keeps the snowfield beside Urwisko and the cliff beside Ruiny Twierdzy out:
 *    they are as white as the paper and they touch it, but nothing is printed on
 *    them. Without it a seed lands in the snow and floods it.
 * 3. The fill then grows a fixed `GROW` pixels outward, through whatever is in
 *    the way, which reaches the drawn contour and takes it in. It is a fixed few
 *    pixels and not another flood, so where a scrap abuts pale artwork the mask
 *    takes a thin rim of it rather than the whole cliff.
 *
 * The Kamienny Most's nine slabs are the exception that proves the shape of it:
 * their captions are lettered onto grey stone, so `CORE` finds only the white
 * scrap under the words and stops at the stone — which is right, because a stone
 * has no torn edge to cut round.
 */
const CORE = { light: 238, saturation: 22 };
const PAPER = { light: 175, saturation: 55 };
const REACH = 45;

/** A fill smaller than this is a speck of highlight, not a scrap. */
const MIN_FILL = 400;

/**
 * How far the fill grows to reach the drawn contour, through anything at all.
 *
 * Through *anything* is the point, and it was not always so. The growth used to
 * be allowed onto paper-ish or dark pixels only, and those two tests do not
 * meet: a pixel at luminance 141, or a bright but saturated one, passes neither,
 * and that is exactly the fringe where the printed line blends into coloured
 * artwork. The growth died on that band where it was there and sailed through to
 * the line where it was not, so the boundary stopped at different distances a
 * few pixels apart — which is a stepped silhouette — and where the band lay on
 * the line, the line came out chopped in half.
 *
 * A fixed number of steps that nothing can halt gives a boundary the same
 * distance from the core everywhere, smooth by construction and always far
 * enough out to hold the whole drawn outline. It costs a two or three pixel
 * fringe of painting where the outline is thinner than this, which reads as part
 * of the scan; a broken outline reads as a fault.
 *
 * Following the line to its far side and stopping there was tried, to get both.
 * It is worse: "ink" is only luminance under 125, which the illustration's own
 * brushstrokes satisfy, so the growth followed them off into the painting.
 */
const GROW = 10;

/**
 * How far a scrap may overhang its own square before the fill gives up on it.
 *
 * Not zero, because the board is drawn and not ruled and the cells are only good
 * to a few tens of pixels at the corners. Not large either: neighbours down a
 * ring's side sit close enough that a generous allowance lets the fill cross
 * into the next scrap, and the strip of somebody else's paper it brings back is
 * the most visible thing that can be wrong with a cut-out.
 */
const SPILL = 35;

export function loadBoard() {
  if (!fs.existsSync(BOARD)) {
    throw new Error(`${BOARD} is missing. It is gitignored; rebuild it with \`npm run assets\`.`);
  }
  return decodePng(fs.readFileSync(BOARD));
}

/**
 * Everything the mask does not reach from the outside is inside something.
 *
 * This is what puts the lettering back: the words are ink, so they are not
 * paper, so they are holes in the paper — and a scrap with its own text punched
 * out of it is not a scrap. Flooding the background from the border and keeping
 * whatever the flood never reached fills them all at once, however many there
 * are and whatever shape.
 */
function fillHoles(mask, width, height) {
  const outside = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let sp = 0;
  const push = (i) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (sp) {
    const i = stack[--sp];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  for (let i = 0; i < mask.length; i++) if (!outside[i]) mask[i] = 1;
}

/**
 * Each field's scrap, as a mask cropped to its own bounding box.
 *
 * Per field and not one mask for the whole board, because two neighbouring
 * scraps' torn edges very nearly touch: growing both out to their contours
 * merges them into a single component, and then Strażnik Magicznych Wrót,
 * Magiczne Wrota and Wieża Przeznaczenia all measure the same 2160-pixel blob.
 * Kept apart, each is its own shape and the boxes cannot cascade.
 *
 * `boxes` is `src/data/field-text-boxes.json`'s array. The fill needs two things
 * from it: a point it is certain is paper, and — since only paper beside
 * lettering may seed — where the lettering is.
 *
 * `cells` is `src/data/field-cells.json`'s, and it is what stops the whole thing
 * running away. Near-white runs a long way across this board, and a fill that
 * crosses from one scrap into the next takes the neighbour's box with it, which
 * takes the neighbour's lettering, which grows the box again. A field's scrap is
 * inside that field's square — that is what a square on a board is — so bounding
 * the fill to it is not a fudge, it is the thing that was always true.
 */
export function fieldScraps({ width, height, comps, data }, boxes, cells) {
  const core = new Uint8Array(width * height);
  const paper = new Uint8Array(width * height);
  const ink = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < width * height; i += comps, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const light = (r * 299 + g * 587 + b * 114) / 1000;
    const max = Math.max(r, g, b);
    const saturation = max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * 255;
    if (light > CORE.light && saturation < CORE.saturation) core[p] = 1;
    if (light > PAPER.light && saturation < PAPER.saturation) paper[p] = 1;
    if (light < 125) ink[p] = 1;
  }

  const seen = new Uint8Array(width * height);
  const beside = new Uint8Array(width * height);
  const scraps = new Map();

  const cellOf = new Map(cells.map((cell) => [cell.id, cell]));
  for (const box of boxes) {
    const cell = cellOf.get(box.id);
    if (!cell) throw new Error(`no cell for ${box.id}`);
    const inCell = (p) => {
      const x = p % width;
      const y = (p / width) | 0;
      return (
        x >= cell.x0 - SPILL && x <= cell.x1 + SPILL && y >= cell.y0 - SPILL && y <= cell.y1 + SPILL
      );
    };
    const t = (box.angle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const at = (u, v) => [
      Math.round(box.cx + u * cos - v * sin),
      Math.round(box.cy + u * sin + v * cos),
    ];

    // Lettering: ink inside the box whose surroundings are mostly paper. An ink
    // pixel out in the painting has painting around it and does not qualify.
    beside.fill(0);
    const letters = [];
    for (let u = -box.w / 2; u < box.w / 2; u += 3) {
      for (let v = -box.h / 2; v < box.h / 2; v += 3) {
        const [x, y] = at(u, v);
        if (x < 16 || y < 16 || x >= width - 16 || y >= height - 16) continue;
        // In the field's own square, not merely in its box. Boxes overlap their
        // neighbours — Twierdza Strzegąca Dróg's reaches down over the top of
        // Mroczna Polana's scrap — and lettering picked up there is the
        // neighbour's, which then seeds a fill on the neighbour's paper and
        // carries the whole scrap back as if it were this field's.
        if (x < cell.x0 || x > cell.x1 || y < cell.y0 || y > cell.y1) continue;
        if (!ink[y * width + x]) continue;
        let round = 0;
        let n = 0;
        for (let dy = -14; dy <= 14; dy += 7) {
          for (let dx = -14; dx <= 14; dx += 7) {
            round += paper[(y + dy) * width + x + dx];
            n++;
          }
        }
        if (round / n < 0.5) continue;
        letters.push(y * width + x);
        for (let dy = -REACH; dy <= REACH; dy += 3) {
          for (let dx = -REACH; dx <= REACH; dx += 3) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            beside[yy * width + xx] = 1;
          }
        }
      }
    }

    // Seeded on a grid rather than at the middle, because the middle of a text
    // box is as likely to land on a letter as on the paper round it, and a scrap
    // can be more than one piece of paper — Wymarłe Miasto is printed on two.
    const found = [];
    for (let u = -box.w / 2 + 6; u < box.w / 2; u += 6) {
      for (let v = -box.h / 2 + 4; v < box.h / 2; v += 5) {
        const [x, y] = at(u, v);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const start = y * width + x;
        if (!beside[start]) continue;
        const blob = fill(core, seen, width, height, start, inCell);
        if (blob && blob.length >= MIN_FILL && isPrintedOn(blob, letters, width)) {
          for (const p of blob) found.push(p);
        }
      }
    }
    // `seen` is shared to keep the fills cheap, so hand it back for the next box.
    for (let p = 0; p < width * height; p++) if (seen[p]) seen[p] = 0;
    if (!found.length) continue;

    const kept = [...trim(found, beside, width, height)];
    const part = grown(kept, width, height, letters);
    if (part) scraps.set(box.id, part);
  }
  return scraps;
}

/** Grows a fill out to the drawn contour and closes its lettering back in. */
function grown(pixels, width, height, letters) {
  const pad = GROW + 3;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (const i of pixels) {
    const x = i % width;
    const y = (i / width) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 3 || h < 3) return null;
  const local = new Uint8Array(w * h);
  for (const i of pixels) local[(((i / width) | 0) - y0) * w + ((i % width) - x0)] = 1;

  let front = [];
  for (let i = 0; i < w * h; i++) if (local[i]) front.push(i);
  for (let step = 0; step < GROW; step++) {
    const next = [];
    for (const i of front) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (local[j]) continue;
          local[j] = 1;
          next.push(j);
        }
      }
    }
    front = next;
  }
  fillHoles(local, w, h);
  keepLettered(local, w, h, letters.map((p) => (((p / width) | 0) - y0) * w + ((p % width) - x0)));
  return { x: x0, y: y0, width: w, height: h, data: local };
}

/**
 * Drops any piece of the finished mask that has none of the field's words on it.
 *
 * The last thing left after the cell bound: down a ring's side the scraps sit
 * close enough that growing out to the contour can bridge two of them, and what
 * comes back is a ribbon of the neighbour's paper along the bottom of the
 * picture. Once the mask is finished the two are separate pieces again in every
 * case that matters, and only one of them has been printed on.
 */
function keepLettered(local, w, h, letters) {
  const label = new Int32Array(w * h).fill(-1);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!local[start] || label[start] >= 0) continue;
    const id = blobs.length;
    const pixels = [];
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      pixels.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      const around = [];
      if (x > 0) around.push(i - 1);
      if (x < w - 1) around.push(i + 1);
      if (y > 0) around.push(i - w);
      if (y < h - 1) around.push(i + w);
      for (const j of around) {
        if (local[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    blobs.push(pixels);
  }
  const words = new Int32Array(blobs.length);
  for (const p of letters) {
    if (p >= 0 && p < w * h && label[p] >= 0) words[label[p]]++;
  }
  const most = Math.max(0, ...words);
  blobs.forEach((pixels, id) => {
    if (words[id] < Math.max(40, most * 0.2)) for (const i of pixels) local[i] = 0;
  });
}

/** The union of every field's scrap, for anything that wants the whole board. */
export function scrapMask(img, boxes, cells) {
  const mask = new Uint8Array(img.width * img.height);
  for (const part of fieldScraps(img, boxes, cells).values()) {
    for (let y = 0; y < part.height; y++) {
      for (let x = 0; x < part.width; x++) {
        if (part.data[y * part.width + x]) mask[(part.y + y) * img.width + part.x + x] = 1;
      }
    }
  }
  return mask;
}

/**
 * True when this field's lettering is printed *on* the fill, not merely near it.
 *
 * Seeding beside a letter is not enough on its own. Ruiny Twierdzy has snow
 * directly above its top line, close enough to seed and separated from the scrap
 * by nothing the flood can see, so it came through as two white islands floating
 * over the text. A letter sits *inside* the paper it is printed on — paper on
 * every side of it — and no letter sits inside a snowdrift.
 */
function isPrintedOn(found, letters, width) {
  const paper = new Set(found);
  let printed = 0;
  for (const at of letters) {
    // Probed at three radii, because at one letter's width the neighbour in most
    // directions is another letter rather than the paper between them.
    let round = 0;
    for (const r of [12, 20, 28]) {
      for (const step of [-r, r, -r * width, r * width]) if (paper.has(at + step)) round++;
    }
    if (round >= 6 && ++printed >= 40) return true;
  }
  return false;
}

/**
 * Drops the parts of a fill that are a long way from any lettering.
 *
 * The last thing pale artwork does that the seeding rule cannot stop: where a
 * scrap's white runs straight into a snowfield with no drawn contour between
 * them, the two are genuinely one region and the fill is right to cross. What
 * gives it away is distance — a scrap is sized to its text and its margins run
 * to a hundred pixels or so, while the lobe of snowfield hanging off Urwisko
 * runs to four hundred. Measured through the fill rather than across it, so a
 * margin that wraps round the end of a line is kept and a bay reached the long
 * way round is not.
 */
const FAR = 200;

function trim(scrap, beside, width, height) {
  const inFill = new Set(scrap);
  const seen = new Set();
  let front = scrap.filter((p) => beside[p]);
  for (const p of front) seen.add(p);
  for (let step = 0; step < FAR && front.length; step++) {
    const next = [];
    for (const i of front) {
      const x = i % width;
      const y = (i / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const j = yy * width + xx;
          if (inFill.has(j) && !seen.has(j)) {
            seen.add(j);
            next.push(j);
          }
        }
      }
    }
    front = next;
  }
  return seen;
}

/** Flood-fills `src` from `start`, returning the pixels it reached. */
function fill(src, seen, width, height, start, inside) {
  if (!src[start] || seen[start] || !inside(start)) return null;
  const stack = [start];
  const found = [];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    found.push(i);
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (src[j] && !seen[j] && inside(j)) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return found;
}

/**
 * The component of `mask` reachable from (x, y), as its own mask.
 *
 * A crop taken round one scrap catches the corners of its neighbours, and on the
 * board's left and right edges it catches whole sentences belonging to the field
 * above. Keeping only what is connected to the middle is what makes a cut-out
 * one field's text rather than a slice of the board that happens to be mostly
 * one field's text.
 */
export function componentAt(mask, width, height, x, y, seen = new Uint8Array(width * height)) {
  const start = y * width + x;
  if (!mask[start] || seen[start]) return null;
  const stack = [start];
  const pixels = [];
  seen[start] = 1;
  let x0 = x;
  let y0 = y;
  let x1 = x;
  let y1 = y;
  while (stack.length) {
    const i = stack.pop();
    pixels.push(i);
    const px = i % width;
    const py = (i / width) | 0;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx;
        const yy = py + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h);
  for (const i of pixels) {
    data[((((i / width) | 0) - y0) * w) + ((i % width) - x0)] = 1;
  }
  // `seen` is the caller's, so leave it as we found it: 57 flood fills that each
  // allocated their own would allocate two gigabytes between them.
  for (const i of pixels) seen[i] = 0;
  return { x: x0, y: y0, width: w, height: h, data };
}

/**
 * Cuts a rotated rectangle out of the board, upright, with `mask` as its alpha.
 *
 * One output pixel per board pixel: the boxes in `field-text-boxes.json` are
 * measured in board pixels and nothing downstream has asked for another size
 * yet, so there is no scale factor to record and get wrong.
 */
export function cutRotated(img, alphaAt, { cx, cy, w, h, angle }) {
  const width = Math.round(w);
  const height = Math.round(h);
  const t = (angle * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x + 0.5 - width / 2;
      const v = y + 0.5 - height / 2;
      const bx = cx + u * cos - v * sin;
      const by = cy + u * sin + v * cos;
      const o = (y * width + x) * 4;
      sampleInto(img, bx, by, data, o);
      data[o + 3] = alphaAt(bx, by);
    }
  }
  return { width, height, comps: 4, data };
}

/** A bilinear reader over a positioned crop, for use as `cutRotated`'s alpha. */
export function maskReader(part) {
  return (x, y) => {
    const fx = x - part.x - Math.floor(x - part.x);
    const fy = y - part.y - Math.floor(y - part.y);
    const x0 = Math.floor(x - part.x);
    const y0 = Math.floor(y - part.y);
    let v = 0;
    for (let dy = 0; dy < 2; dy++) {
      const yy = y0 + dy;
      if (yy < 0 || yy >= part.height) continue;
      for (let dx = 0; dx < 2; dx++) {
        const xx = x0 + dx;
        if (xx < 0 || xx >= part.width) continue;
        v += part.data[yy * part.width + xx] * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      }
    }
    return Math.round(v * 255);
  };
}

/** Bilinear sample of an RGB image, written as the first three bytes at `o`. */
export function sampleInto(img, x, y, out, o) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let dy = 0; dy < 2; dy++) {
      const yy = Math.min(img.height - 1, Math.max(0, y0 + dy));
      for (let dx = 0; dx < 2; dx++) {
        const xx = Math.min(img.width - 1, Math.max(0, x0 + dx));
        v +=
          img.data[(yy * img.width + xx) * img.comps + c] *
          (dx ? fx : 1 - fx) *
          (dy ? fy : 1 - fy);
      }
    }
    out[o + c] = v;
  }
}

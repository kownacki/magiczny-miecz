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
 * is pure white and unsaturated — median luminance 255, median saturation 0 —
 * and so is a great deal of the painting: snow, cloud, the grey slabs of the
 * Kamienny Most, and every highlight. Measured over the whole scan, 23% of the
 * board passes even a threshold tight enough to throw away a third of the real
 * paper. A first attempt at this thresholded and then filled holes, and called
 * 53.7% of the board parchment.
 *
 * So the scraps are found structurally instead: flood-fill outward from inside
 * each of the 57 text boxes, which are known, and keep only what is reachable.
 * A scrap is bounded by a drawn contour that the fill cannot cross, so it stops
 * at the tear. That is not a heuristic about colour, it is the same reason the
 * printed scrap reads as a scrap to a player looking at the board.
 */
const PAPER = { light: 190, saturation: 45 };

/**
 * A fill that grows past this much of its box has escaped through a gap in the
 * drawn contour into the sky behind, and is thrown away rather than trusted.
 * At the thresholds above, none of the 57 does.
 */
const LEAK = 3;

/** Ink: the printed lettering, and the torn contour drawn round every scrap. */
const INK = 110;

/**
 * How far the ink outline sits outside the white paper.
 *
 * The contour is drawn *on* the tear, so the white stops a few pixels short of
 * the black. Cutting on the white would leave every scrap with its outline
 * shaved off on one side and a halo of illustration on the other; cutting on the
 * black keeps the drawn edge, which is the whole character of the thing.
 * Measured off the scans at 5–8px, so 9 reaches it without reaching past it.
 */
const OUTLINE = 9;

export function loadBoard() {
  if (!fs.existsSync(BOARD)) {
    throw new Error(`${BOARD} is missing. It is gitignored; rebuild it with \`npm run assets\`.`);
  }
  return decodePng(fs.readFileSync(BOARD));
}

/** Separable max filter — a square dilation, done as two linear passes. */
function dilate(src, width, height, r) {
  const tmp = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < width && src[row + xx]) v = 1;
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < height && tmp[yy * width + x]) v = 1;
      }
      out[y * width + x] = v;
    }
  }
  return out;
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
 * 1 wherever the board is scrap — paper, its lettering and its torn outline.
 *
 * `boxes` is `src/data/field-text-boxes.json`'s array: the fill needs a point it
 * is certain is paper, and those rectangles are the only record of where one is.
 *
 * Returned at the scan's own resolution, because both the things built on it
 * want it there: a torn contour resampled from half size is a torn contour with
 * the tear smoothed off, and the clean-art windows are measured in board pixels.
 */
export function scrapMask({ width, height, comps, data }, boxes) {
  const paper = new Uint8Array(width * height);
  const ink = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < width * height; i += comps, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const light = (r * 299 + g * 587 + b * 114) / 1000;
    const max = Math.max(r, g, b);
    const saturation = max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * 255;
    if (light > PAPER.light && saturation < PAPER.saturation) paper[p] = 1;
    else if (light < INK) ink[p] = 1;
  }

  const mask = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  for (const box of boxes) {
    const cap = box.w * box.h * LEAK;
    const t = (box.angle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    // Seeded on a grid rather than at the middle, because the middle of a text
    // box is as likely to land on a letter as on the paper round it, and a scrap
    // can be more than one piece of paper — Wymarłe Miasto is printed on two.
    for (let u = -box.w / 2 + 10; u < box.w / 2; u += 24) {
      for (let v = -box.h / 2 + 6; v < box.h / 2; v += 14) {
        const x = Math.round(box.cx + u * cos - v * sin);
        const y = Math.round(box.cy + u * sin + v * cos);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const found = fill(paper, seen, width, height, y * width + x, cap);
        if (found) for (const p of found) mask[p] = 1;
      }
    }
  }

  fillHoles(mask, width, height);
  const near = dilate(mask, width, height, OUTLINE);
  for (let p = 0; p < width * height; p++) if (ink[p] && near[p]) mask[p] = 1;
  fillHoles(mask, width, height);
  return mask;
}

/** Flood-fills `src` from `start`, or gives up and returns null past `cap` pixels. */
function fill(src, seen, width, height, start, cap) {
  if (!src[start] || seen[start]) return null;
  const stack = [start];
  const found = [];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    found.push(i);
    if (found.length > cap) return null;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (src[j] && !seen[j]) {
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

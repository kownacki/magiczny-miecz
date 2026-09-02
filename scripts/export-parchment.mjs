/** Harvests the printed torn edge off the board, in pieces a parchment can be built from. */

import fs from "node:fs";
import path from "node:path";
import { encodePng } from "./lib/png.mjs";
import { loadBoard, scrapMask, sampleInto } from "./lib/parchment.mjs";
import boxes from "../src/data/field-text-boxes.json" with { type: "json" };
import cells from "../src/data/field-cells.json" with { type: "json" };

/**
 * Why this exists at all.
 *
 * Each of the 57 Obszary has its instruction printed on a torn scrap of
 * parchment laid over the painting. The obvious way to reuse them is to cut all
 * 57 out, which gets you a picture of printed text: fixed at one size,
 * unselectable, unsearchable, and hopeless for Uroczysko's 413 characters or
 * Zamek Bestii's 576. The better way is to set the transcription — which we
 * already have, in `src/data/*-fields.json` — inside a scrap we assemble
 * ourselves. That needs the *edge*, not the scraps.
 *
 * What makes it possible is that the edges are not a repeated stamp. Every blob
 * was drawn by hand, separately: the same idiom on all of them — shallow rounded
 * scallops, an occasional sharper notch, a consistent amplitude — but no two
 * sequences alike. Compare Studnia Wieczności's top edge against Wieża
 * Przeznaczenia's. So there is no canonical corner to find, and equally no
 * pattern an assembled edge could be caught deviating from: a library of real
 * cut runs, shuffled, reads as another blob from the same hand.
 *
 * Every pixel here is off the scan. Nothing is drawn, generated or filled in.
 */

/**
 * The one constraint the library exists to satisfy.
 *
 * Two runs butted end to end must not leave a step. So every piece is cut where
 * its torn contour crosses the baseline — the straight line the scallops
 * oscillate about — and always on the way *out*, never on the way back in. Then
 * any end meets any other end at the same height and in the same sense, and the
 * library can be shuffled. The offset is the same for every piece by
 * construction: exactly `PAPER` pixels from the paper's inner edge, which is the
 * bottom row of a straight run and the two open ends of a corner.
 *
 * An end cut on a descending crossing would meet an ascending one at the right
 * height and the wrong slope, which reads as a notch no hand would have drawn.
 *
 * Both depths are measured off the scan rather than chosen. Across every
 * straight stretch of contour on the board the tear reaches at most 30px either
 * side of its own baseline, so `OUT` clears the outward excursions. `PAPER` is
 * limited by the board and not by taste: between the tear and the first line of lettering a scrap has
 * only 30 to 60 pixels of bare paper, so a slice deeper than this one would
 * carry somebody's title along the edge and repeat it.
 */
const OUT = 40;
const PAPER = 48;
const SKIN = 20;
const HEIGHT = OUT + PAPER;

/**
 * A run has to be long enough to be worth shuffling and short enough to find.
 *
 * The board does not have many long straight stretches of tear that also have
 * bare paper behind them — the scraps are sized to their text, so most of the
 * contour is either short, curved, or has a title pressed up against it. 340 is
 * about where the supply runs out.
 */
const SPAN = 360;
const MIN_RUN = 250;

/**
 * How far along each arm a corner reaches, before snapping to the nearest rising
 * crossing.
 *
 * About `PAPER`, so a corner tile comes out roughly the same square as a run is
 * tall — which is what a corner of a frame is. It cannot be exactly that: the
 * crossing is where the tear happens to be and not where we would like it, so
 * the tiles vary by twenty pixels or so and `index.json` records what each one
 * came out as. Reaching further was tried and does not work, because the paper
 * inside a corner has to be bare for the whole of the tile, and on most scraps
 * the lettering starts well inside a hundred pixels.
 */
const ARM = 48;

/** Contour points to fit when asking whether something is straight, or a corner. */
const FIT = 90;

/**
 * Contour points to ignore either side of a corner's apex before fitting its
 * arms. The corners are drawn rounded, not mitred, so a fit that runs up to the
 * apex measures the curve rather than the arm: it reports a bend of sixty
 * degrees where there is a right angle, and calls a straight arm crooked. The
 * whole board yielded one corner before this gap and thirty after it.
 */
const APEX = 24;

/**
 * The most inked the paper side of a piece may be, row by row.
 *
 * Not zero: the printed edge carries little decorative dashes just inside the
 * tear and they belong to the edge, which puts a clean run's worst row around a
 * tenth. A row through lettering is a quarter or more.
 *
 * Corners get more rope. Their rows are a third the length of a run's, so one
 * decorative dash is a bigger share of one, and there are far fewer corners on
 * the board that are straight, drawn, convex and bare all at once.
 */
const BARE = 0.12;
const BARE_CORNER = 0.30;

/** A contour shorter than this is a speck's outline, not a scrap's. */
const MIN_CONTOUR = 400;

/** And one longer than this is not an outline at all — see `traceContours`. */
const MAX_CONTOUR = 200_000;

const WANT_RUNS = 12;
const WANT_CORNERS = 8;

const RAW = "assets/extracted/parchment";
const CHOSEN = "public/parchment";

/**
 * Walks the boundary of every blob in the mask, in order.
 *
 * Moore tracing. The contour comes back as the pixels themselves rather than
 * anything smoothed, because the staircase a boundary walk leaves is under a
 * pixel and the tear it is walking is fifteen — smoothing to tidy the former
 * would cost the latter, which is the only thing here anybody wants.
 */
function traceContours(mask, width, height) {
  const seen = new Uint8Array(width * height);
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const contours = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = y * width + x;
      if (!mask[at] || seen[at] || mask[at - 1]) continue;
      const points = [];
      let bx = x;
      let by = y;
      let from = 4; // we arrived from the background pixel on the left
      let closed = false;
      // A scrap's outline is a few thousand pixels even counting the staircase.
      // The cap is not an optimisation: a mask with a one-pixel spur in it sends
      // the walk back and forth forever, and unbounded that is six gigabytes of
      // contour before anything says so.
      for (let step = 0; step < MAX_CONTOUR; step++) {
        if (step > 3 && bx === x && by === y) {
          closed = true;
          break;
        }
        points.push(bx, by);
        seen[by * width + bx] = 1;
        let next = -1;
        for (let k = 1; k <= 8; k++) {
          const d = (from + k) % 8;
          const nx = bx + dirs[d][0];
          const ny = by + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) {
            next = d;
            bx = nx;
            by = ny;
            break;
          }
        }
        if (next < 0) break;
        from = (next + 5) % 8;
      }
      if (closed && points.length / 2 >= MIN_CONTOUR) contours.push(points);
    }
  }
  return contours;
}

/** Principal direction and centroid of a stretch of contour, and how straight it is. */
function fitLine(points, from, to) {
  const n = to - from;
  let mx = 0;
  let my = 0;
  for (let i = from; i < to; i++) {
    mx += points[i * 2];
    my += points[i * 2 + 1];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = from; i < to; i++) {
    const dx = points[i * 2] - mx;
    const dy = points[i * 2 + 1] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dir = [Math.cos(angle), Math.sin(angle)];
  let worst = 0;
  let sum = 0;
  for (let i = from; i < to; i++) {
    const off = -(points[i * 2] - mx) * dir[1] + (points[i * 2 + 1] - my) * dir[0];
    worst = Math.max(worst, Math.abs(off));
    sum += off * off;
  }
  return { mx, my, dir, worst, spread: Math.sqrt(sum / n) };
}

const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const flip = (v) => [-v[0], -v[1]];

/**
 * Which way the paper lies from a point on the baseline.
 *
 * Asked of the mask rather than of the contour's winding, because a blob traced
 * from an arbitrary starting pixel can wind either way, and the answer has to be
 * right for a piece that will be composited.
 */
function paperward(mask, width, height, x, y, dir) {
  const normal = [-dir[1], dir[0]];
  const count = (n) => {
    let inside = 0;
    for (let d = 12; d <= 44; d += 4) {
      const px = Math.round(x + n[0] * d);
      const py = Math.round(y + n[1] * d);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      if (mask[py * width + px]) inside++;
    }
    return inside;
  };
  const front = count(normal);
  const back = count(flip(normal));
  if (front === back) return null;
  return front > back ? normal : flip(normal);
}

/**
 * The contour's outward excursions along a stretch, as (distance, offset) pairs.
 *
 * `along` is the reading direction of the finished piece and `outward` points
 * away from the paper, so a crossing from offset ≤ 0 to offset > 0 is the rising
 * crossing every cut has to land on.
 */
function profile(points, from, to, at, along, outward) {
  const out = [];
  for (let i = from; i < to; i++) {
    const dx = points[i * 2] - at[0];
    const dy = points[i * 2 + 1] - at[1];
    out.push({ t: dx * along[0] + dy * along[1], off: dx * outward[0] + dy * outward[1] });
  }
  out.sort((a, b) => a.t - b.t);
  const crossings = [];
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].off <= 0 && out[i].off > 0) crossings.push(out[i].t);
  }
  return crossings;
}

/**
 * The inkiest row of the paper side of a piece: 0 is bare paper.
 *
 * Rows, not a total, and only the pixels that will actually be opaque. Both
 * halves of that are the difference between a test that works and one that does
 * not. A word is three or four per cent of a three-hundred-pixel run, which is
 * indistinguishable from the little decorative dashes the printed edge carries
 * just inside the tear — but a row *through* a word is a quarter ink, and a row
 * through dashes is a tenth. And counting samples that fall outside the mask
 * would score the tear itself as ink, when the tear is exactly what the alpha
 * removes.
 *
 * `SKIN` is where it starts looking. Not at the baseline, because the drawn
 * contour is itself black and dips inward, and not below the tear's deepest
 * bite either — on the tighter scraps the lettering crowds right up to the edge,
 * and a test that starts below it cannot see the word it is there for.
 *
 * `depth` is for corners, whose paper is not a strip at all but the whole
 * quadrant between the two arms, reaching as far in as the other arm is long.
 * Checking only `PAPER` deep there passed corners with a word sitting inside
 * them. The corner's own void needs no special handling: it is outside the mask,
 * so it contributes no samples either way.
 */
function paperInk(img, mask, origin, along, paperDir, length, from = 0, depth = PAPER) {
  let worst = 0;
  for (let d = SKIN; d <= depth; d += 2) {
    let dark = 0;
    let opaque = 0;
    for (let t = from; t <= length; t += 3) {
      const x = Math.round(origin[0] + along[0] * t + paperDir[0] * d);
      const y = Math.round(origin[1] + along[1] * t + paperDir[1] * d);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      if (!mask[y * img.width + x]) continue;
      opaque++;
      const i = (y * img.width + x) * img.comps;
      if ((img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000 < 150) dark++;
    }
    // Eight is enough to judge a row by, and a corner's rows are short.
    if (opaque >= 8) worst = Math.max(worst, dark / opaque);
  }
  return worst;
}

/**
 * Resamples a piece into its canonical frame: baseline horizontal, paper below.
 *
 * Output (0, OUT) is `origin`; +x follows `along` and +y follows `normal`. Alpha
 * comes off the mask through the same bilinear filter as the colour, so the cut
 * carries the drawn edge's own softness rather than a staircase.
 */
function render(img, mask, piece) {
  const { origin, along, normal, width, height } = piece;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = x + 0.5;
      const d = y + 0.5 - OUT;
      const bx = origin[0] + along[0] * t + normal[0] * d;
      const by = origin[1] + along[1] * t + normal[1] * d;
      const o = (y * width + x) * 4;
      sampleInto(img, bx, by, data, o);
      data[o + 3] = sampleMask(mask, img.width, img.height, bx, by);
    }
  }
  defringe(data, width, height);
  return { width, height, comps: 4, data };
}

/**
 * Takes the painted rim off the outside of a piece.
 *
 * The mask grows a fixed distance outward to be sure of taking the whole drawn
 * contour in, and where that contour is thinner than the growth it also takes
 * two or three pixels of the picture beyond it. On a whole scrap that is a rim
 * nobody notices against the painting it was cut from; on an eighty-pixel corner
 * that will be composited onto a parchment we made, it is a yellow halo.
 *
 * Only pixels on the edge of the piece are eligible, and that is the whole
 * trick. Judged on colour alone the same test fires on the flecks of ochre
 * inside the tear and punches the paper full of holes — a fleck is not on the
 * edge, and a rim is.
 */
const RIM = 4;

function defringe(data, width, height) {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];
  const painted = (o) => {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const light = (r * 299 + g * 587 + b * 114) / 1000;
    const max = Math.max(r, g, b);
    const saturation = max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * 255;
    return light > 120 && saturation > 90;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha[i] <= 128 || !painted(i * 4)) continue;
      let open = false;
      for (let dy = -RIM; dy <= RIM && !open; dy++) {
        for (let dx = -RIM; dx <= RIM; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || alpha[yy * width + xx] <= 128) {
            open = true;
            break;
          }
        }
      }
      if (open) data[i * 4 + 3] = 0;
    }
  }
}

function sampleMask(mask, width, height, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let v = 0;
  for (let dy = 0; dy < 2; dy++) {
    const yy = Math.min(height - 1, Math.max(0, y0 + dy));
    for (let dx = 0; dx < 2; dx++) {
      const xx = Math.min(width - 1, Math.max(0, x0 + dx));
      v += mask[yy * width + xx] * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    }
  }
  return Math.round(v * 255);
}

/** Straight runs: long stretches of tear with bare paper behind them. */
function findRuns(img, mask, contours) {
  const found = [];
  for (const points of contours) {
    const n = points.length / 2;
    if (n < FIT * 2) continue;
    for (let s = 0; s + FIT < n; s += 14) {
      // The arc has to reach SPAN as the crow flies without wandering to get
      // there; a corner or a deep bay fails this before anything is fitted.
      let e = s;
      while (
        e < n - 1 &&
        Math.hypot(points[e * 2] - points[s * 2], points[e * 2 + 1] - points[s * 2 + 1]) < SPAN
      ) {
        e++;
      }
      if (e >= n - 1 || e - s > SPAN * 1.7) continue;
      const fit = fitLine(points, s, e);
      if (fit.spread > 16 || fit.worst > 40) continue;
      if (!isDrawn(img, mask, points, s, e)) continue;

      const paperDir = paperward(mask, img.width, img.height, fit.mx, fit.my, fit.dir);
      if (!paperDir) continue;
      // +x is `along` and +y is `paperDir`, so the pair has to be right-handed
      // or the piece comes out mirrored and the tear is somebody else's hand.
      const along = cross(fit.dir, paperDir) > 0 ? fit.dir : flip(fit.dir);
      const crossings = profile(points, s, e, [fit.mx, fit.my], along, flip(paperDir));
      if (crossings.length < 2) continue;
      const width = crossings.at(-1) - crossings[0];
      if (width < MIN_RUN) continue;

      const origin = [
        fit.mx + along[0] * crossings[0],
        fit.my + along[1] * crossings[0],
      ];
      const ink = paperInk(img, mask, origin, along, paperDir, width);
      if (ink > BARE) continue;

      found.push({
        kind: "run",
        score: fit.spread + ink * 120,
        at: [Math.round(fit.mx), Math.round(fit.my)],
        origin,
        along,
        normal: paperDir,
        width: Math.round(width),
        height: HEIGHT,
      });
      s = e - FIT; // don't harvest the same stretch twice
    }
  }
  return found;
}

/**
 * Corners: two straight runs meeting square, cut to the same offset on both arms.
 *
 * A corner cannot be cut at exactly `ARM`, because a rising crossing is where
 * the tear happens to be and not where we would like it. So the tile is whatever
 * size the nearest crossing makes it and `index.json` records that — which is
 * the honest way round, since the thing composition needs is the offset at the
 * ends, not a tidy number for the length.
 */
function findCorners(img, mask, contours) {
  const found = [];
  for (const points of contours) {
    const n = points.length / 2;
    if (n < FIT * 3) continue;
    for (let i = FIT + APEX; i + FIT + APEX < n; i += 6) {
      const before = fitLine(points, i - APEX - FIT, i - APEX);
      const after = fitLine(points, i + APEX, i + APEX + FIT);
      if (before.spread > 24 || after.spread > 24) continue;
      const turn =
        Math.abs(
          Math.atan2(before.dir[1], before.dir[0]) - Math.atan2(after.dir[1], after.dir[0]),
        ) *
        (180 / Math.PI);
      if (Math.min(Math.abs(turn - 90), Math.abs(turn - 270)) > 30) continue;

      const corner = intersect(before, after);
      if (!corner) continue;
      if (!isDrawn(img, mask, points, i - APEX - FIT, i + APEX + FIT)) continue;
      const arms = [
        { fit: before, from: i - APEX - FIT, to: i },
        { fit: after, from: i, to: i + APEX + FIT },
      ].map((arm) => {
        const mid = (arm.from + arm.to) >> 1;
        const toMid = [points[mid * 2] - corner[0], points[mid * 2 + 1] - corner[1]];
        const away =
          toMid[0] * arm.fit.dir[0] + toMid[1] * arm.fit.dir[1] > 0 ? arm.fit.dir : flip(arm.fit.dir);
        return { ...arm, away };
      });
      // Canonical corner: a scrap's top-left, both arms leaving along +x and +y
      // with the paper in the quadrant between them. Ordering by handedness is
      // what puts them that way round without ever mirroring the tear.
      const [first, second] = cross(arms[0].away, arms[1].away) > 0 ? arms : [arms[1], arms[0]];
      const middle = [
        Math.round(corner[0] + (first.away[0] + second.away[0]) * 24),
        Math.round(corner[1] + (first.away[1] + second.away[1]) * 24),
      ];
      // A scrap that runs off the edge of the sheet makes a right angle out of
      // one torn edge and one guillotine, which is not a corner anybody drew.
      const EDGE = 60;
      if (
        corner[0] < EDGE ||
        corner[1] < EDGE ||
        corner[0] >= img.width - EDGE ||
        corner[1] >= img.height - EDGE
      ) {
        continue;
      }
      if (!mask[middle[1] * img.width + middle[0]]) continue;
      // The two-arm test on its own finds notches, not corners: a spike into the
      // paper turns ninety degrees twice in quick succession and satisfies every
      // gate above. What separates them is what is around the point — a corner of
      // a scrap has paper in roughly one quadrant of a disc drawn on it, and a
      // notch has it in three.
      if (!isQuadrant(mask, img.width, img.height, corner)) continue;

      // Each arm's paper side is the other arm's direction, so its outward is
      // the other arm's direction reversed. Same rising-crossing rule as a run.
      const reach = (arm, paperDir) => {
        const ts = profile(points, arm.from, arm.to, corner, arm.away, flip(paperDir));
        const usable = ts.filter((t) => t > 24);
        if (!usable.length) return null;
        return usable.reduce((a, b) => (Math.abs(b - ARM) < Math.abs(a - ARM) ? b : a));
      };
      const reachX = reach(first, second.away);
      const reachY = reach(second, first.away);
      // Short arms carry too little tear to be worth having in the library.
      if (!reachX || !reachY || reachX < 20 || reachY < 20) continue;
      // A corner's arms are measured from `OUT` out, not from the corner: at the
      // corner itself the two tears meet and there is no paper yet in either
      // direction, so the first stretch of each arm is painting by construction.
      const ink = Math.max(
        paperInk(img, mask, corner, first.away, second.away, reachX, 0, reachY),
        paperInk(img, mask, corner, second.away, first.away, reachY, 0, reachX),
      );
      if (ink > BARE_CORNER) continue;

      found.push({
        kind: "corner",
        score: (before.spread + after.spread) / 2 + ink * 120,
        at: [Math.round(corner[0]), Math.round(corner[1])],
        // render() already offsets the normal axis by OUT, so backing the origin
        // up one OUT along the *along* axis is all it takes to put the corner
        // itself at (OUT, OUT) — which is where the two baselines have to meet
        // for a corner's ends to line up with a run's.
        origin: [corner[0] - first.away[0] * OUT, corner[1] - first.away[1] * OUT],
        along: first.away,
        normal: second.away,
        width: OUT + Math.round(reachX),
        height: OUT + Math.round(reachY),
      });
      i += FIT;
    }
  }
  return found;
}

/**
 * True when the stretch of contour really is a drawn tear.
 *
 * The mask's boundary is not the same thing as the printed edge. Where a scrap's
 * white runs into snow or cloud the flood-fill stops on a colour change and
 * leaves a boundary that is perfectly real and has nothing drawn on it — and the
 * straightness and quadrant tests are just as happy with those, which is how
 * three pieces of the Świątynia Nemed icefield got into the library looking like
 * corners. What separates them is the black line: a tear the artist drew has one
 * and a colour change does not.
 *
 * Looked for nine pixels either side rather than five, because the mask's
 * boundary now sits a little outside the drawn line rather than in the middle of
 * it — it grows a fixed distance through anything, which is what stopped it
 * chopping the line in half — so the line is further in than it used to be.
 */
function isDrawn(img, mask, points, from, to) {
  const darks = [];
  for (let i = from; i < to; i += 4) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    let darkest = 255;
    for (let dx = -9; dx <= 9; dx++) {
      for (let dy = -9; dy <= 9; dy++) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const k = (py * img.width + px) * img.comps;
        const light = (img.data[k] * 299 + img.data[k + 1] * 587 + img.data[k + 2] * 114) / 1000;
        if (light < darkest) darkest = light;
      }
    }
    darks.push(darkest);
  }
  if (darks.length < 8) return false;
  darks.sort((a, b) => a - b);
  return darks[Math.floor(darks.length * 0.8)] < 110;
}

/** True when paper fills about a quarter of a disc drawn on the point. */
function isQuadrant(mask, width, height, at) {
  const R = 70;
  let paper = 0;
  let seen = 0;
  for (let a = 0; a < 360; a += 4) {
    const t = (a * Math.PI) / 180;
    for (let r = 16; r <= R; r += 6) {
      const x = Math.round(at[0] + Math.cos(t) * r);
      const y = Math.round(at[1] + Math.sin(t) * r);
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      seen++;
      if (mask[y * width + x]) paper++;
    }
  }
  const share = paper / seen;
  return share > 0.12 && share < 0.45;
}

function intersect(a, b) {
  const d = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
  if (Math.abs(d) < 1e-6) return null;
  const t = ((b.mx - a.mx) * b.dir[1] - (b.my - a.my) * b.dir[0]) / d;
  return [a.mx + a.dir[0] * t, a.my + a.dir[1] * t];
}

/**
 * True when a rendered piece is one clean shape rather than a handful of bits.
 *
 * The last thing that separates a corner from a piece of the painting that
 * happens to turn a right angle. Every gate before this one looks at the
 * contour; this one looks at what actually came out, and what comes out of a bad
 * corner is a scatter of islands — a leaf, a roof, a stray dash — with the paper
 * nowhere in particular. One shape, filling a decent part of the tile, is what a
 * corner of a scrap looks like.
 *
 * A tenth of the tile and not a quarter, which is what the quadrant it sits in
 * would suggest: the arms are cut at whichever rising crossing falls nearest the
 * target length, so a corner whose two tears both happen to bite deep at that
 * moment is a thin wedge of paper in a square tile and still a perfectly good
 * corner.
 */
function isTidy(shot) {
  const { width, height, data } = shot;
  const on = new Uint8Array(width * height);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 128) {
      on[i] = 1;
      total++;
    }
  }
  if (total < width * height * 0.1) return false;
  const seen = new Uint8Array(width * height);
  let biggest = 0;
  for (let start = 0; start < width * height; start++) {
    if (!on[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % width;
      const y = (i / width) | 0;
      const next = [];
      if (x > 0) next.push(i - 1);
      if (x < width - 1) next.push(i + 1);
      if (y > 0) next.push(i - width);
      if (y < height - 1) next.push(i + width);
      for (const j of next) {
        if (on[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    biggest = Math.max(biggest, n);
  }
  return biggest / total >= 0.92;
}

/** The best pieces, no two off the same patch of board. */
function choose(candidates, want, apart) {
  const picked = [];
  for (const one of [...candidates].sort((a, b) => a.score - b.score)) {
    if (picked.some((p) => Math.hypot(p.at[0] - one.at[0], p.at[1] - one.at[1]) < apart)) continue;
    picked.push(one);
    if (picked.length >= want) break;
  }
  return picked;
}

/**
 * The paper itself: what colour it is, and whether it is one colour.
 *
 * Worth measuring rather than assuming, because a 4916x6798 scan of a printed
 * board is not lit evenly and a fill sampled from one corner can be visibly
 * wrong in the other. Reported as a spread so the answer is checkable.
 */
function paperSample(img, mask) {
  // Colour first, over every scrap on the board rather than over one patch, so
  // the drift is measured against the whole scan and not against a corner of it.
  const BANDS = 4;
  const bands = Array.from({ length: BANDS * BANDS }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
  for (let y = 0; y < img.height; y += 7) {
    for (let x = 0; x < img.width; x += 7) {
      if (!mask[y * img.width + x]) continue;
      const i = (y * img.width + x) * img.comps;
      const light = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
      if (light < 200) continue; // lettering and the torn outline are not paper
      const band =
        (((y / img.height) * BANDS) | 0) * BANDS + (((x / img.width) * BANDS) | 0);
      bands[band].r += img.data[i];
      bands[band].g += img.data[i + 1];
      bands[band].b += img.data[i + 2];
      bands[band].n++;
    }
  }
  const filled = bands.filter((b) => b.n > 500);
  const lights = filled.map((b) => (b.r * 299 + b.g * 587 + b.b * 114) / 1000 / b.n);
  const total = filled.reduce(
    (a, b) => ({ r: a.r + b.r, g: a.g + b.g, b: a.b + b.b, n: a.n + b.n }),
    { r: 0, g: 0, b: 0, n: 0 },
  );
  const mean = [total.r, total.g, total.b].map((v) => Math.round(v / total.n));

  // Then one square of it to tile. A scrap is sized to its text, so a big clean
  // square is scarce: take the largest that exists rather than insisting on one
  // size and coming back empty-handed.
  let patch = null;
  for (const size of [224, 192, 160, 128, 96]) {
    for (let y = 0; y + size < img.height && !patch; y += 24) {
      for (let x = 0; x + size < img.width && !patch; x += 24) {
        let clean = true;
        for (let dy = 0; dy < size && clean; dy += 4) {
          for (let dx = 0; dx < size; dx += 4) {
            const px = x + dx;
            const py = y + dy;
            const i = (py * img.width + px) * img.comps;
            const light =
              (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000;
            if (!mask[py * img.width + px] || light < 205) {
              clean = false;
              break;
            }
          }
        }
        if (clean) patch = { size, at: [x, y] };
      }
    }
    if (patch) break;
  }

  return {
    mean,
    bands: filled.length,
    lightest: Math.round(Math.max(...lights)),
    darkest: Math.round(Math.min(...lights)),
    patch,
  };
}

function write(dir, name, img) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), encodePng(img));
}

const board = loadBoard();
const mask = scrapMask(board, boxes.boxes, cells.cells);
const contours = traceContours(mask, board.width, board.height);
console.log(`${contours.length} scrap outlines traced`);

const runs = findRuns(board, mask, contours).filter((p) => isTidy(render(board, mask, p)));
const corners = findCorners(board, mask, contours).filter((p) => isTidy(render(board, mask, p)));
console.log(`${runs.length} straight runs and ${corners.length} corners are candidates`);

fs.rmSync(RAW, { recursive: true, force: true });
for (const list of [runs, corners]) {
  list.forEach((piece, i) => {
    write(RAW, `${piece.kind}-${String(i).padStart(3, "0")}-at-${piece.at.join("-")}.png`, render(board, mask, piece));
  });
}

const chosen = [...choose(runs, WANT_RUNS, 900), ...choose(corners, WANT_CORNERS, 220)];
fs.rmSync(CHOSEN, { recursive: true, force: true });
const counts = { run: 0, corner: 0 };
const pieces = chosen.map((piece) => {
  const file = `${piece.kind}-${String((counts[piece.kind] += 1)).padStart(2, "0")}.png`;
  write(CHOSEN, file, render(board, mask, piece));
  return { file, kind: piece.kind, width: piece.width, height: piece.height, from: piece.at };
});

const paper = paperSample(board, mask);
if (paper.patch) {
  const { size, at } = paper.patch;
  const data = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sampleInto(board, at[0] + x, at[1] + y, data, (y * size + x) * 3);
    }
  }
  write(CHOSEN, "paper.png", { width: size, height: size, comps: 3, data });
}

fs.writeFileSync(
  path.join(CHOSEN, "index.json"),
  `${JSON.stringify(
    {
      $note: {
        what: "Pieces of the board's own torn parchment edge, cut at the scan's native resolution.",
        baseline: `Every piece is cut where its torn contour crosses the baseline on the way out, so any end butts against any other without a step. In a run the baseline is row ${OUT} from the top and the paper fills the ${PAPER} rows below it; a corner has a baseline on each of its two open ends, at the same offset.`,
        orientation:
          "Runs read left to right with the paper below. Corners are a scrap's top-left: both arms leave the corner along +x and +y with the paper in the quadrant between them, and the corner itself is at (36, 36). Rotate at composition time.",
        paper: `Mean paper colour rgb(${paper.mean.join(", ")}). Averaged over ${paper.bands} regions of the board the paper's luminance runs ${paper.darkest} to ${paper.lightest}${paper.lightest - paper.darkest <= 3 ? ", which is flat enough that one fill matches everywhere" : ", so the scan drifts and a single flat fill will not match everywhere"}.${paper.patch ? ` paper.png is a ${paper.patch.size}px square of clean paper to tile.` : " No clean square large enough to tile was found."}`,
        provenance:
          "Every pixel is off assets/extracted/board/board.png. Nothing here is drawn, generated or filled in.",
      },
      baseline: { out: OUT, paper: PAPER },
      pieces,
    },
    null,
    1,
  )}\n`,
);

console.log(`${counts.run} runs and ${counts.corner} corners chosen into ${CHOSEN}`);
console.log(
  `paper rgb(${paper.mean.join(", ")}), luminance ${paper.darkest}..${paper.lightest} across ${paper.bands} regions` +
    (paper.patch ? `, tile ${paper.patch.size}px` : ", no tileable square found"),
);

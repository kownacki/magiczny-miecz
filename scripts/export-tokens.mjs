/** Cuts the Żetony Pomocnicze off their sheet — one of each denomination — for use beside a number in the interface. */

import fs from "node:fs";
import path from "node:path";
import { extractImages } from "./lib/pdf-images.mjs";
import { encodePng, cropImage } from "./lib/png.mjs";

/**
 * The four parameters, as tokens.
 *
 * The rulebook assigns the colours and this is the whole of it: Miecz is
 * czerwony (1.2), Magia niebieski (2.2), Życie zielony (4.1) and a Sztuka Złota
 * is one of the żółte ones with a bar printed on it (3.1). The sheet prints
 * them in that order down the page — blue, green, red, gold — forty of each, in
 * denominations of 1, 2, 3 and 4 (ten of each denomination), except the gold,
 * which is forty of the same coin.
 *
 * Only one of each denomination is cut. They are identical impressions of the
 * same plate, so the other nine are the same picture with different scanner
 * noise, and the interface needs a picture of a "3", not thirty of them.
 */
const BLOCKS = [
  { stat: "magia", values: [1, 2, 3, 4] },
  { stat: "zycie", values: [1, 2, 3, 4] },
  { stat: "miecz", values: [1, 2, 3, 4] },
  // One coin, printed forty times. The denomination is in the name rather than
  // on the token: 3.2 starts a character with one and counts them singly.
  { stat: "zloto", values: [1] },
];

const SOURCE = "assets/raw/MM - Żetony.pdf";
const OUT = "public/tokens";

/**
 * The sheet is one plate of 10 x 16 tokens with no margin.
 *
 * Measured rather than assumed: 1414 across divides into ten columns of 141.4
 * and 2347 down into sixteen rows of 146.7, and the colour bands change at
 * exactly every fourth row. There are no printed cut lines to detect here — the
 * tokens are punched, not cut — so the grid is arithmetic and the frame around
 * each token is found per cell below.
 */
const COLS = 10;
const ROWS = 16;

/**
 * Which column to cut each token from.
 *
 * The plate is inked unevenly across its width and the scan is very slightly
 * skewed, so the middle of the sheet is the safest place to reach: far from the
 * edges where the punch runs off, and far from the gutter shadow down either
 * side.
 */
const COLUMN = 4;

/**
 * The token inside its cell.
 *
 * A cell is a token face inside the sheet it was punched from, and the two are
 * different colours: blue in grey, green or red in yellow, bright gold in dull
 * gold. So the token is the run of lines whose colour is the face's.
 *
 * Everything here is medians of colour, and nothing anywhere is contrast. Three
 * earlier attempts measured how sharp the picture was, on the reasoning that a
 * flat face inside a halftoned sheet has an edge where the grain begins — and
 * every one of them found the numeral instead of the border, because a printed
 * 1 is a stroke running down most of the face and its two edges are sharper
 * than any halftone. Tokens showing a 1 came out cropped to the width of their
 * own 1. A median cannot be moved by a minority; the numeral is a minority of
 * every line it crosses, and of every band read here it is no part at all.
 *
 * So: seed from a patch that is inside the face of every cell on the sheet and
 * outside any numeral, learn the face's colour there, then read outwards. The
 * sides are found first, along two thin bands above and below where a numeral
 * reaches; the top and bottom are then found along two bands just inside those
 * sides, where a numeral does not reach either.
 *
 * Per cell rather than as one measured inset, because the scan drifts: the face
 * begins 24 pixels into the first row's cells and 28 into the last row's, which
 * is enough to leave a rind of the sheet down one side of a token cut to its
 * neighbour's measurements.
 */
function faceBox(cell) {
  const at = (x, y) => {
    const i = (y * cell.width + x) * cell.comps;
    return [cell.data[i], cell.data[i + 1], cell.data[i + 2]];
  };

  /**
   * A box known to be face in every cell, and known to hold no numeral.
   *
   * The face runs from 24 to 120 across a cell 141 wide and drifts about four
   * pixels over the length of the sheet; a fifth of the way in from each side
   * clears both that and the widest numeral's shoulders.
   */
  const inset = { x: Math.round(cell.width * 0.21), y: Math.round(cell.height * 0.21) };
  /**
   * The face's colour, tried four ways and settled by which one works.
   *
   * A single sample is what three earlier versions did and none of them held.
   * The four corners of the face fail on a 4, whose right-hand stroke runs the
   * whole height so that two of them sit on white. A strip across the top fails
   * on a 3, whose top bar reaches higher than the others. Whatever spot is
   * chosen, some numeral is printed on it.
   *
   * But a wrong colour fails loudly: nothing in the cell matches it, both walls
   * stay where they started, and the token comes out the size of the seed box.
   * So the seed is not reasoned about at all — all four strips are tried and
   * the one that finds the biggest token is right, because only the face's own
   * colour spans the face.
   */
  const strip = (x0, y0, x1, y1) => {
    const seen = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) seen.push(at(x, y));
    return median(seen);
  };
  const far = { x: cell.width - inset.x, y: cell.height - inset.y };
  const candidates = [
    strip(inset.x, inset.y, far.x, inset.y + 6),
    strip(inset.x, far.y - 6, far.x, far.y),
    strip(inset.x, inset.y, inset.x + 6, far.y),
    strip(far.x - 6, inset.y, far.x, far.y),
  ];

  const boxFor = (face) => {
    const isFace = (colour) =>
      Math.abs(colour[0] - face[0]) +
        Math.abs(colour[1] - face[1]) +
        Math.abs(colour[2] - face[2]) <
      60;

    /**
     * Walk outwards from a place known to be face, and stop where it stops.
     *
     * Never inwards, and never across the middle. The numeral reaches from a
     * seventh of the way down the face to within a twentieth of its bottom, so
     * there is no band across the token that clears it — but it never comes
     * near the sides, so a scan that starts a fifth of the way in and only ever
     * moves outwards cannot meet it. Everything between the two walls is face
     * by construction, whatever is printed on it.
     */
    const wall = (from, step, limit, colourAt) => {
      let i = from;
      while (i + step >= 0 && i + step <= limit && isFace(colourAt(i + step))) i += step;
      return i;
    };
    /** The median colour of one line, over the stretch of it the caller trusts. */
    const along = (bands, get) => (i) => {
      const seen = [];
      for (const [from, to] of bands) for (let j = from; j <= to; j++) seen.push(get(i, j));
      return median(seen);
    };

    // Across first, reading each column along a strip at the top of the face
    // only: a numeral starts about a seventh of the way down, so the top is the
    // one stretch of a token that holds nothing but its colour. Read over the
    // whole height instead and a 4 loses the right edge of its own diagonal.
    const column = along([[inset.y, inset.y + 12]], (x, y) => at(x, y));
    const left = wall(inset.x, -1, cell.width - 1, column);
    const right = wall(far.x, 1, cell.width - 1, column);

    // Then down, along two strips just inside those sides, now that they are
    // known exactly. A few pixels in from the edge of the face: far enough not
    // to catch the border, much too far out for any numeral to reach.
    const row = along(
      [
        [left + 3, left + 9],
        [right - 9, right - 3],
      ],
      (y, x) => at(x, y),
    );
    const top = wall(inset.y, -1, cell.height - 1, row);
    const bottom = wall(far.y, 1, cell.height - 1, row);
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  };

  const found = candidates.map(boxFor).sort((a, b) => b.w * b.h - a.w * a.h)[0];

  /**
   * Squared off, because the tokens are square.
   *
   * The sides come out within a pixel of a hundred on all thirteen and the tops
   * likewise, but the bottom row of each colour block runs six pixels long: the
   * gutter between one block and the next is wider than the border between two
   * tokens and is not the same colour as either, so the wall walking downwards
   * takes a moment to notice it has left. Measuring the one dimension that is
   * never in doubt and applying it to both is more honest than tuning a
   * threshold until a particular scan happens to line up.
   */
  const across = { from: found.x, to: found.x + found.w - 1 };
  const down = { from: found.y, to: found.y + found.w - 1 };

  return {
    x: across.from,
    y: down.from,
    w: across.to - across.from + 1,
    h: down.to - down.from + 1,
  };
}

function median(colours) {
  const pick = (channel) => {
    const sorted = colours.map((colour) => colour[channel]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return [pick(0), pick(1), pick(2)];
}

function run() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`${SOURCE} is missing — the scans live in Drive and are gitignored.`);
    process.exit(1);
  }
  const [sheet] = extractImages(fs.readFileSync(SOURCE));
  if (!sheet) {
    console.error("No image in the Żetony sheet.");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const cellWidth = sheet.width / COLS;
  const cellHeight = sheet.height / ROWS;
  let written = 0;

  BLOCKS.forEach((block, blockIndex) => {
    block.values.forEach((value, valueIndex) => {
      const row = blockIndex * 4 + valueIndex;
      const cell = cropImage(
        sheet,
        Math.round(COLUMN * cellWidth),
        Math.round(row * cellHeight),
        Math.round(cellWidth),
        Math.round(cellHeight),
      );
      const box = faceBox(cell);
      const face = cropImage(cell, box.x, box.y, box.w, box.h);
      const name = block.values.length === 1 ? `${block.stat}.png` : `${block.stat}-${value}.png`;
      fs.writeFileSync(path.join(OUT, name), encodePng(face));
      console.log(`${name}: ${box.w}x${box.h} from row ${row}, column ${COLUMN}`);
      written++;
    });
  });

  console.log(`${written} tokens -> ${OUT}`);
}

run();

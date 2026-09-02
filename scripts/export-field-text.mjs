/** Cuts each Obszar's printed description off the board scan, on a transparent ground. */

import fs from "node:fs";
import path from "node:path";
import { encodePng } from "./lib/png.mjs";
import { cutRotated, fieldScraps, loadBoard, maskReader } from "./lib/parchment.mjs";
import boxes from "../src/data/field-text-boxes.json" with { type: "json" };
import cells from "../src/data/field-cells.json" with { type: "json" };

/**
 * The 57 instructions are printed on torn scraps of parchment laid over the
 * painting, at 57 different angles — the board is meant to be read from all four
 * sides of a table, so a third of them are upside down and a third are on their
 * side. `src/data/field-text-boxes.json` says where each one is and which way up;
 * this cuts them out, de-rotates them, and drops the painting behind them.
 *
 * The alpha is the point. A rectangle round a scrap is a rectangle of somebody
 * else's illustration with a scrap in the middle of it, and Wymarłe Miasto's
 * description is printed on *two* scraps with a hand's width of painting between
 * them — which the alpha separates and a rectangle could not.
 *
 * The output is survey material, not an asset: nothing in the app renders these,
 * and if the parchment turns out to be reproducible at any size (see
 * `export-parchment.mjs`) nothing ever will, because setting the transcription
 * we already have beats a picture of the printed text on every count. So the
 * images are gitignored and the boxes are committed. The boxes are the expensive
 * half; the images are ten seconds of this script.
 */

const TEXT = "assets/extracted/field-text";
const MASKS = "assets/extracted/field-masks";

const board = loadBoard();
const scraps = fieldScraps(board, boxes.boxes, cells.cells);

fs.rmSync(TEXT, { recursive: true, force: true });
fs.rmSync(MASKS, { recursive: true, force: true });
fs.mkdirSync(TEXT, { recursive: true });
fs.mkdirSync(MASKS, { recursive: true });

/**
 * The whole board's mask, kept as one image.
 *
 * The per-field masks below are what cut the scraps; this is their union, and
 * its complement is every square inch of painting the scraps are not covering.
 * That is what the clean-art windows are measured against, so it is worth the
 * one file rather than making the next reader rebuild it.
 */
const whole = new Uint8Array(board.width * board.height);
for (const part of scraps.values()) {
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      if (part.data[y * part.width + x]) {
        whole[(part.y + y) * board.width + part.x + x] = 1;
      }
    }
  }
}
fs.writeFileSync(
  path.join(MASKS, "board.png"),
  encodePng({
    width: board.width,
    height: board.height,
    comps: 1,
    data: Buffer.from(whole.map((v) => (v ? 255 : 0))),
  }),
);

const index = [];
let missed = 0;

for (const box of boxes.boxes) {
  const part = scraps.get(box.id);
  if (!part) {
    // Nothing printed on paper anywhere in the box. Cut opaque rather than
    // blank: there is no torn edge to cut round, and an honest rectangle is
    // better than an empty file.
    missed++;
    fs.writeFileSync(
      path.join(TEXT, `${box.id}.png`),
      encodePng(cutRotated(board, () => 255, box)),
    );
    index.push({ id: box.id, scrap: null });
    continue;
  }

  fs.writeFileSync(
    path.join(TEXT, `${box.id}.png`),
    encodePng(cutRotated(board, maskReader(part), box)),
  );
  fs.writeFileSync(
    path.join(MASKS, `${box.id}.png`),
    encodePng({
      width: part.width,
      height: part.height,
      comps: 1,
      data: Buffer.from(part.data.map((v) => (v ? 255 : 0))),
    }),
  );
  index.push({
    id: box.id,
    scrap: { x: part.x, y: part.y, width: part.width, height: part.height },
  });
}

fs.writeFileSync(
  path.join(MASKS, "index.json"),
  `${JSON.stringify(
    {
      $note: {
        what: "One mask per Obszar: 255 where the board is parchment — paper, lettering and torn outline — and 0 where it is painting.",
        placing:
          "Each mask is cropped to its scrap's bounding box; `scrap` gives that box in board pixels, so the mask drops back onto assets/extracted/board/board.png exactly. board.png here is their union over the whole board.",
        missing:
          "`scrap: null` means no lettering-bearing paper was found anywhere in the box, and the description was cut opaque instead.",
      },
      fields: index,
    },
    null,
    1,
  )}\n`,
);

console.log(`${boxes.boxes.length} descriptions cut into ${TEXT}`);
console.log(`${boxes.boxes.length - missed} masks into ${MASKS}, plus the whole board`);
if (missed) console.log(`${missed} had no scrap under the box and were cut opaque`);

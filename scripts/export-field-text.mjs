/** Cuts each Obszar's printed description off the board scan, on a transparent ground. */

import fs from "node:fs";
import path from "node:path";
import { encodePng } from "./lib/png.mjs";
import { componentAt, cutRotated, loadBoard, maskReader, scrapMask } from "./lib/parchment.mjs";
import boxes from "../src/data/field-text-boxes.json" with { type: "json" };

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
const mask = scrapMask(board, boxes.boxes);

fs.rmSync(TEXT, { recursive: true, force: true });
fs.rmSync(MASKS, { recursive: true, force: true });
fs.mkdirSync(TEXT, { recursive: true });
fs.mkdirSync(MASKS, { recursive: true });

/**
 * The whole board's mask, kept as one image.
 *
 * The per-field masks below are what cut the scraps; this is their complement,
 * which is every square inch of the painting the scraps are not covering. That
 * is what the clean-art windows are measured against, and what anything wanting
 * to know where the paper *isn't* needs, so it is worth the one file rather than
 * making the next reader rebuild it.
 */
fs.writeFileSync(
  path.join(MASKS, "board.png"),
  encodePng({
    width: board.width,
    height: board.height,
    comps: 1,
    data: Buffer.from(mask.map((v) => (v ? 255 : 0))),
  }),
);

// One flood-fill scratch buffer for all 57: `componentAt` leaves it as it found
// it, and allocating a board-sized array per field would allocate two gigabytes.
const scratch = new Uint8Array(board.width * board.height);
const index = [];
let missed = 0;

for (const box of boxes.boxes) {
  const part = componentAt(
    mask,
    board.width,
    board.height,
    Math.round(box.cx),
    Math.round(box.cy),
    scratch,
  );
  if (!part) {
    // The nine Kamienny Most captions are lettered straight onto grey stone
    // rather than onto a scrap, so there is nothing for the mask to find under
    // the middle of the box. Those are cut opaque, which is right: there is no
    // torn edge on them to cut round.
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
          "Each mask is cropped to its scrap's bounding box; `scrap` gives that box in board pixels, so the mask drops back onto assets/extracted/board/board.png exactly. board.png here is the same mask for the whole board, uncropped.",
        missing:
          "`scrap: null` means the mask found nothing under the box's middle. That is the nine Kamienny Most slabs, whose captions are lettered onto stone rather than onto a scrap.",
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

/** Cuts the two faces of the Karta Zmiany Natury off the sheet that carries them. */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * 7.2's card, which is one card with two faces.
 *
 * "Gdy Postać zmienia swoją Naturę, obok jej Karty musi zostać umieszczona
 * Karta Zmiany Natury. Kartę należy położyć w ten sposób, by ukazywała nową
 * Naturę Postaci (właściwym napisem ku górze)." — one piece of card printed
 * `Zły` on one side and `DOBRY` on the other, turned to whichever is now true
 * and taken away again when a character returns to the Natura its own Karta
 * prints.
 *
 * Which is why these come off two different files. Sheet 9 is the one that
 * carries everything the box had no room for anywhere else — four Zamieniony w
 * Kamień cards, the standees, and four of these — so the `Zły` face is on the
 * front and the `DOBRY` face is on its reverse, in the `(tyły)` file that also
 * gave `export-card-back.mjs` the one ZDARZENIE back the archive has.
 *
 * **There is no third face.** The box prints Dobry and Zły and nothing else,
 * because a Chaotyczna Natura is the absence of the other two: a character who
 * turns Chaotyczna has the card taken away rather than turned over. Anything
 * that wants to *say* "chaotyczna" has to say it in words — see the badge on
 * the seat card, which is where that decision lives.
 *
 * The word rather than the whole card. The two faces are not printed alike —
 * `Zły` sits inside the notched frame the cards are die-cut to and `DOBRY` is
 * bare on the paper — so cutting both to their outlines would put two
 * different-looking objects side by side to say two halves of one thing. The
 * lettering is what the card is for, and it is the same lettering the rest of
 * the box is set in.
 */
const FACES = [
  {
    id: "zly",
    sheet:
      "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
      "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony.pdf",
    // Third row, first column — one of the three clean ones, away from the
    // Kamień cards whose black artwork the ink search would swallow.
    look: { left: 0.03, top: 0.505, right: 0.22, bottom: 0.585 },
  },
  {
    id: "dobry",
    sheet:
      "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
      "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony (tyły).pdf",
    // Second row, last column, which on the reverse is the one with nothing
    // printed near it.
    look: { left: 0.79, top: 0.24, right: 0.98, bottom: 0.47 },
  },
  {
    /**
     * The third face, which the game does not have.
     *
     * Looked for first, and it is not in the box or in any of the five
     * expansions: not on the Gród piony sheet or its reverse, not on the
     * Labirynt Magów's, not on the Krypta Upiorów's. That is consistent rather
     * than an oversight — 7.1 has Chaotyczna as the Natura that "nie czerpie z
     * niej prawie żadnych korzyści, ale też nic jej nie grozi", the neutral
     * third that the other two are departures from, and a card with two faces
     * covers it by being taken off the table.
     *
     * The app cannot do that. A referee that owns the record has to be able to
     * say *which* Natura is true now, and "no card" is indistinguishable from
     * "the character started this way" — which is exactly the state a change to
     * Chaotyczna needs to be told apart from. So the third plaque is drawn.
     *
     * After `DOBRY` rather than after `Zły`, because those two do not match
     * each other — Roman capitals on one face and a calligraphic italic on the
     * other — so there is no single house style to follow, and capitals are the
     * half that a ten-letter word can be set in without becoming a scribble.
     * Bodoni is the Didone nearest what the sheet is set in.
     */
    id: "chaotyczny",
    drawn: "CHAOTYCZNY",
  },
];

/**
 * The drawn face, set to look like the printed one.
 *
 * `DOBRY` measures 373 wide by 136 tall — about 0.55 of the cap height per
 * letter, where Bodoni sets the same letters at about 0.76 — so the sheet's
 * lettering is condensed, and a word set at the face's own width stands out as
 * the one that is not from the box.
 *
 * Condensed further than that arithmetic asks, and bold, for a reason the
 * arithmetic cannot see: `CHAOTYCZNY` is twice the word `DOBRY` is, so on a
 * plaque of one size it is fitted by its width and comes out shorter — and a
 * shorter word drawn at the same stroke weight reads as a lighter one. The
 * squeeze buys back the cap height and the weight buys back the colour, and the
 * two of them put it on the paper at the same strength as the printed face.
 *
 * Rendered through sharp's SVG, which reaches the system's own fonts. Which
 * makes this macOS-only, like `sips` two functions down and like every other
 * script in here.
 */
const DRAWN = { font: "Bodoni 72", weight: "bold", size: 200, squeeze: 0.62 };

/**
 * The box the word is looked for in is measured; where the word *is* inside it
 * is found.
 *
 * `detectCells` cannot help here — it looks for printed rules crossing the
 * whole sheet, and this one is cards floating on a blue field with no grid to
 * find. So the constant above is a region big enough to hold the word and
 * nothing else, and the ink inside it is what gets cut. That way a re-export at
 * a different resolution, or a scan a few pixels off, still lands on the word.
 *
 * Sixty out of 255 finds black lettering and not the blue, which comes in at
 * about ninety-four — close enough that the obvious threshold of "darker than
 * half" takes the whole card and reports a word the size of the search box.
 */
const INK = 60;

/**
 * One rectangle for both, so a Dobry plaque and a Zły plaque are the same
 * object with a different word on it.
 *
 * `contain` rather than `cover`: the two words are nothing like the same shape
 * — `DOBRY` is wide Roman capitals and `Zły` is a narrow italic with a
 * descender — and the thing that has to match between them is the height of
 * the lettering, not the area it fills.
 */
const SIZE = { width: 260, height: 90 };

/**
 * The white border around the word, as a share of the plaque's height.
 *
 * Added rather than cut: taking the margin out of the sheet takes whatever the
 * sheet has there, and what the sheet has just left of `Zły` is the notched
 * frame the card is die-cut to — which arrived as a grey smudge down the side
 * of a plaque that is supposed to be a word on paper. The lettering is cut to
 * the ink and the paper around it is made here.
 */
const MARGIN = 0.16;

/**
 * A page with the word somewhere on it, however the word got there.
 *
 * Both kinds go down the same pipe from here — find the ink, cut to it, make
 * the paper — so the drawn face cannot drift from the two scanned ones by being
 * built differently. Only where the black comes from differs.
 */
function pageFor({ sheet, drawn, id }) {
  if (!drawn) {
    // sharp cannot open a PDF; sips renders it at the same 2480 across that
    // every other sheet in this pipeline is read at.
    const rendered = `/tmp/mm-natura-${id}.png`;
    execFileSync(
      "sips",
      ["-s", "format", "png", "--resampleWidth", "2480", sheet, "--out", rendered],
      { stdio: "ignore" },
    );
    return { source: rendered, temporary: true };
  }

  // Room to spare all round, because the ink search is what decides where the
  // word actually is — a canvas fitted to a guess at the text's width is a
  // guess that clips a letter.
  const box = { width: DRAWN.size * drawn.length, height: DRAWN.size * 2 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">
    <rect width="${box.width}" height="${box.height}" fill="#ffffff"/>
    <g transform="translate(${box.width / 2} ${box.height / 2}) scale(${DRAWN.squeeze} 1)">
      <text x="0" y="0" font-family="${DRAWN.font}" font-size="${DRAWN.size}"
            font-weight="${DRAWN.weight}" text-anchor="middle"
            dominant-baseline="central" fill="#111111">${drawn}</text>
    </g>
  </svg>`;
  return { source: Buffer.from(svg), temporary: false };
}

for (const face of FACES) {
  const { id, sheet, look } = face;
  if (sheet && !fs.existsSync(sheet)) {
    console.warn(`skipped ${id} — no ${sheet}`);
    continue;
  }

  const { source, temporary } = pageFor(face);
  const { width, height } = await sharp(source).metadata();
  // The drawn page holds nothing but the word, so the whole of it is the place
  // to look; the sheets need telling which card.
  const region = look
    ? {
        left: Math.round(width * look.left),
        top: Math.round(height * look.top),
        width: Math.round(width * (look.right - look.left)),
        height: Math.round(height * (look.bottom - look.top)),
      }
    : { left: 0, top: 0, width, height };

  const { data, info } = await sharp(source)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const at = (y * info.width + x) * info.channels;
      const lum = (data[at] * 299 + data[at + 1] * 587 + data[at + 2] * 114) / 1000;
      if (lum >= INK) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    console.warn(`skipped ${id} — no ink in the search box`);
    if (temporary) fs.rmSync(source, { force: true });
    continue;
  }

  const box = {
    left: region.left + x0,
    top: region.top + y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };

  const inset = Math.round(SIZE.height * MARGIN);
  const out = `public/cards/natura-${id}.jpg`;
  fs.mkdirSync("public/cards", { recursive: true });
  await sharp(source)
    .extract(box)
    .resize({
      width: SIZE.width - inset * 2,
      height: SIZE.height - inset * 2,
      fit: "contain",
      background: "#ffffff",
    })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: "#ffffff",
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toFile(out);
  if (temporary) fs.rmSync(source, { force: true });

  console.log(`${out} — ink ${x1 - x0 + 1}x${y1 - y0 + 1} of ${width}x${height}`);
}

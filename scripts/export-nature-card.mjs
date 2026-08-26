/** Builds 7.2's Karta Zmiany Natury, one per Natura, on a frame cut from the scan. */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * 7.2's card, which is one card with two faces — and a third the box never
 * printed.
 *
 * "Gdy Postać zmienia swoją Naturę, obok jej Karty musi zostać umieszczona
 * Karta Zmiany Natury. Kartę należy położyć w ten sposób, by ukazywała nową
 * Naturę Postaci (właściwym napisem ku górze)." One piece of card printed `Zły`
 * on one side and `DOBRY` on the other, turned to whichever is now true and
 * taken away when a character returns to the Natura its own Karta prints.
 *
 * **There is no third face.** Looked for and not there: not in the box, and not
 * on the piony sheets of Gród, Labirynt Magów or Krypta Upiorów, front or
 * reverse. That is consistent rather than missing — 7.1 has Chaotyczna as the
 * Natura that "nie czerpie z niej prawie żadnych korzyści, ale też nic jej nie
 * grozi", the neutral third the other two are departures from, and a card with
 * two faces covers it by being taken off the table. The app cannot do that: at
 * a table the absent card reads because the Karta Postaci is lying right there
 * saying what the character started as, and a referee that owns the record has
 * to name the Natura outright.
 *
 * # Why none of the printed lettering is used
 *
 * The two printed faces are not set alike. `Zły` is a calligraphic italic in
 * title case; `DOBRY` is Roman capitals. Side by side as two thirds of one
 * object they read as two different objects, and adding a third in either hand
 * makes one of those two the odd one out rather than settling it.
 *
 * So the frame is the box's and the lettering is not. All three words are set
 * here, in one face at one size, on a card built from the pieces of the printed
 * one. Bodoni is the Didone nearest what the sheet is set in — nearer than the
 * Times the Losowa card is drawn with (`make-random-card.py`), which is that
 * card's because it is imitating a Karta Postaci's title band, a different
 * piece of printing entirely.
 *
 * # The frame comes in pieces, so it can be any size
 *
 * A card in this box is a white field with a quarter-circle bitten out of each
 * corner, and nothing else: the four straight edges carry no printing at all.
 * So there is no need to cut one card and then live with its proportions. Cut
 * the four corners, and any rectangle can be made by standing them on a white
 * field of whatever shape is wanted and painting the blue round it.
 *
 * Which is what `buildCard` does, and it is why this card can be half again as
 * wide as it was without a word of it being squashed. The corners scale off the
 * card's shorter side, because a bitten corner is a fixed thing a blade did and
 * does not stretch when the card does.
 */
const SHEET =
  "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
  "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony.pdf";

/** The three words, in the order 7.1 puts them: two departures from a middle. */
const FACES = [
  { id: "dobry", word: "DOBRY" },
  { id: "chaotyczny", word: "CHAOTYCZNY" },
  { id: "zly", word: "ZŁY" },
];

/**
 * Where to go looking for the card the frame is cut from.
 *
 * A region rather than the card's own edges, because `detectCells` cannot help
 * here — it looks for printed rules crossing the whole page, and this sheet is
 * cards floating on a blue field with no grid to find. So the constant is the
 * second row's last column, bounded tightly enough to hold nothing else, and
 * the white card inside it is measured.
 *
 * White and not blue, which took a detour to arrive at. The blue reads as the
 * obvious thing to find — it is the card's own field — but on this sheet it is
 * not the card's alone: the row beneath is a blue block running the full width,
 * joined to this one, so a search that reaches even one line into it comes back
 * with a field the size of the page and the Zamieniony w Kamień card inside it.
 *
 * Bounded above the row of Zdarzenia as well: their white is white too, and a
 * region that starts one line into them begins the card several hundred pixels
 * too high.
 */
const LOOK = { left: 0.79, top: 0.243, right: 0.975, bottom: 0.465 };

/**
 * The printed card, measured — and everything shaped by it.
 *
 * `NOTCH` is the corner bite: 76 pixels down the left edge and 75 across the
 * top, which is one radius both ways and so a circle rather than an ellipse.
 * Kept as a share of the shorter side, because that is what keeps it a circle —
 * a corner scaled by the width of a card half as tall as it is wide would eat
 * the card.
 *
 * `RATIO` is the card itself, turned on its side. Turned and not invented: a
 * Karta Zmiany Natury lying down is then exactly as proportioned as one
 * standing up, and is the same object as every other card in the box rather
 * than a rectangle somebody chose. Lying down for a reason — `CHAOTYCZNY` is
 * twice the word `DOBRY` is, and on an upright card at one size it had to be
 * set half as tall as its neighbours to fit, reading as a caption rather than
 * as the same kind of thing. Turning the card is the answer that does not touch
 * the type, and the frame comes in pieces now, so its shape is not fixed by the
 * scan.
 *
 * Checked against that scan on every run: see the warning below `paperIn`.
 */
const PRINTED = { width: 398, height: 705 };
const NOTCH = 75 / PRINTED.width;
const RATIO = PRINTED.height / PRINTED.width;

/** How big the built card is, and how much of it the word may have. */
const OUT_WIDTH = 720;
const WORD = { left: 0.06, right: 0.94, top: 0.14, bottom: 0.86 };

/**
 * The blue everything in this box is printed on.
 *
 * The same three numbers `make-random-card.py` measured off a Karta Postaci for
 * the Losowa card, which is the point: two drawn cards that disagree about the
 * house colour are two drawn cards that look drawn.
 */
const TEAL = { r: 16, g: 108, b: 140 };

/** How much of it shows round the card, as a share of the card's shorter side. */
const BORDER = 0.085;

/**
 * One face, one size, and no fitting word by word.
 *
 * The three are set at the same `size` and then scaled by one common factor —
 * whichever of them runs out of room first — rather than each being fitted to
 * the box on its own. Fitting each is what makes three cards that disagree
 * about how big lettering is.
 *
 * Condensed, because the sheet's own capitals are: `DOBRY` measures about 0.55
 * of its cap height per letter where Bodoni sets the same letters at about
 * 0.76. It also buys `CHAOTYCZNY` back some of the height it loses to its own
 * length, and every word here is condensed by the same amount, so they still
 * agree.
 *
 * Rendered through sharp's SVG, which reaches the system's own fonts. Which
 * makes this macOS-only, like `sips` below and like every other script here.
 */
const DRAWN = { font: "Bodoni 72", weight: "bold", size: 240, squeeze: 0.72 };

/** Darker than this is ink; the blue comes in at about ninety-four. */
const INK = 60;

/* ---------------------------------------------------------------------- */

/** The tightest box round the card's white paper, inside `region`. */
async function paperIn(source, region) {
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
      if (lum <= 200) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return {
    left: region.left + x0,
    top: region.top + y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };
}

/**
 * The four bitten corners, each cut from the corner it belongs to.
 *
 * All four rather than one flipped four ways. They are the same shape, and a
 * mirrored copy would be a pixel or two cleaner — which is the problem: these
 * come off a scan of a printed sheet, and four corners identical to the pixel
 * are four corners announcing they were never printed.
 */
async function cornersOf(source, paper) {
  const size = Math.round(paper.width * NOTCH);
  const at = (left, top) =>
    sharp(source).extract({ left, top, width: size, height: size }).png().toBuffer();
  return {
    tl: await at(paper.left, paper.top),
    tr: await at(paper.left + paper.width - size, paper.top),
    bl: await at(paper.left, paper.top + paper.height - size),
    br: await at(paper.left + paper.width - size, paper.top + paper.height - size),
  };
}

/**
 * A blank card of any shape at all: white paper, four bitten corners, blue
 * round the outside.
 *
 * The straight edges are painted rather than tiled because there is nothing on
 * them to tile — a printed card's edge here is the boundary between its white
 * and the field it sits on, and both of those are flat colour. If a card in one
 * of the expansions turns out to carry a rule or a pattern down its edges, a
 * fifth and sixth piece go in here.
 */
async function buildCard(corners, { width, height }) {
  const margin = Math.round(Math.min(width, height) * BORDER);
  const inner = { width: width - margin * 2, height: height - margin * 2 };
  const size = Math.round(Math.min(inner.width, inner.height) * NOTCH);
  const bite = (buffer) => sharp(buffer).resize(size, size).png().toBuffer();

  const paper = await sharp({
    create: { ...inner, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: await bite(corners.tl), left: 0, top: 0 },
      { input: await bite(corners.tr), left: inner.width - size, top: 0 },
      { input: await bite(corners.bl), left: 0, top: inner.height - size },
      { input: await bite(corners.br), left: inner.width - size, top: inner.height - size },
    ])
    .png()
    .toBuffer();

  return sharp(paper)
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: TEAL })
    .png()
    .toBuffer();
}

/** One word, set and then cut to its ink so it can be placed by what is on the paper. */
async function setWord(word) {
  // Room to spare all round: the ink search is what decides where the word
  // actually is, and a canvas fitted to a guess at the text's width is a guess
  // that clips a letter.
  const box = { width: DRAWN.size * word.length, height: DRAWN.size * 2 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">
    <rect width="${box.width}" height="${box.height}" fill="#ffffff"/>
    <g transform="translate(${box.width / 2} ${box.height / 2}) scale(${DRAWN.squeeze} 1)">
      <text x="0" y="0" font-family="${DRAWN.font}" font-size="${DRAWN.size}"
            font-weight="${DRAWN.weight}" text-anchor="middle"
            dominant-baseline="central" fill="#111111">${word}</text>
    </g>
  </svg>`;

  const page = Buffer.from(svg);
  const { data, info } = await sharp(page)
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
  if (x1 < 0) throw new Error(`nothing set for "${word}" — is ${DRAWN.font} installed?`);
  const ink = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return { image: await sharp(page).extract(ink).png().toBuffer(), ...ink };
}

/* ---------------------------------------------------------------------- */

if (!fs.existsSync(SHEET)) {
  console.warn(`nothing to do — no ${SHEET}`);
  process.exit(0);
}

const rendered = "/tmp/mm-natura-sheet.png";
execFileSync(
  "sips",
  // sharp cannot open a PDF; sips renders one at the 2480 across that every
  // other sheet in this pipeline is read at.
  ["-s", "format", "png", "--resampleWidth", "2480", SHEET, "--out", rendered],
  { stdio: "ignore" },
);

const page = await sharp(rendered).metadata();
const paper = await paperIn(rendered, {
  left: Math.round(page.width * LOOK.left),
  top: Math.round(page.height * LOOK.top),
  width: Math.round(page.width * (LOOK.right - LOOK.left)),
  height: Math.round(page.height * (LOOK.bottom - LOOK.top)),
});
if (!paper) throw new Error("no white card where the Karta Zmiany Natury should be");

// The shape the output is built to is the shape the card actually is, so say so
// if a re-scan ever moves it. One percent is well inside what finding an edge
// on a printed scan is worth arguing about, and well outside a real change.
const measured = paper.width / paper.height;
const printed = PRINTED.width / PRINTED.height;
if (Math.abs(measured - printed) / printed > 0.01) {
  console.warn(
    `PRINTED says ${PRINTED.width}x${PRINTED.height}; this scan measures ` +
      `${paper.width}x${paper.height}. RATIO and NOTCH are both off it.`,
  );
}

const out = { width: OUT_WIDTH, height: Math.round(OUT_WIDTH / RATIO) };
const blank = await buildCard(await cornersOf(rendered, paper), out);
fs.rmSync(rendered, { force: true });

const margin = Math.round(Math.min(out.width, out.height) * BORDER);
const inner = { width: out.width - margin * 2, height: out.height - margin * 2 };
const band = {
  left: margin + Math.round(inner.width * WORD.left),
  top: margin + Math.round(inner.height * WORD.top),
  width: Math.round(inner.width * (WORD.right - WORD.left)),
  height: Math.round(inner.height * (WORD.bottom - WORD.top)),
};

const words = await Promise.all(FACES.map((face) => setWord(face.word)));
// One factor for all three, taken from whichever of them runs out of room first.
const scale = Math.min(
  1,
  ...words.map((word) => Math.min(band.width / word.width, band.height / word.height)),
);

fs.mkdirSync("public/cards", { recursive: true });

for (const [index, face] of FACES.entries()) {
  const word = words[index];
  const size = {
    width: Math.max(1, Math.round(word.width * scale)),
    height: Math.max(1, Math.round(word.height * scale)),
  };
  const file = `public/cards/natura-${face.id}.jpg`;
  await sharp(blank)
    .composite([
      {
        input: await sharp(word.image).resize(size).toBuffer(),
        left: band.left + Math.round((band.width - size.width) / 2),
        top: band.top + Math.round((band.height - size.height) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toFile(file);
  console.log(`${file} — ${out.width}x${out.height}, "${face.word}" ${size.width}x${size.height}`);
}

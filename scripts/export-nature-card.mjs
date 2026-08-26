/** Cuts the Karta Zmiany Natury off the sheet that carries it, once per Natura. */

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
 * **There is no third face.** Looked for and not there: not in the box, and not
 * on the piony sheets of Gród, Labirynt Magów or Krypta Upiorów, front or
 * reverse. That is consistent rather than missing — 7.1 has Chaotyczna as the
 * Natura that "nie czerpie z niej prawie żadnych korzyści, ale też nic jej nie
 * grozi", the neutral third the other two are departures from, and a card with
 * two faces covers it by being taken off the table.
 *
 * The app cannot do that. At a table the absent card reads because the Karta
 * Postaci is lying right there saying what the character started as; a referee
 * that owns the record has to name the Natura outright, and "no card" cannot be
 * told apart from "never changed". So the third face is drawn.
 *
 * # One plate, three words
 *
 * The two printed faces do not look alike. `Zły` sits on the card as die-cut —
 * blue field, notched shoulders, the word on white — and `DOBRY` is bare
 * lettering on paper with no frame at all, because the reverse of a
 * print-and-play sheet gets what it needs and no decoration. Cutting each to
 * its own outline would put two unlike objects on the table to say two halves
 * of one thing.
 *
 * So the card is cut once, from the `Zły` face, and its word is painted out to
 * leave a blank plate. Each of the three words is then set back into the same
 * rectangle on it. Two of the three words are the box's own ink, lifted off the
 * sheets at full resolution; only `CHAOTYCZNY` is drawn, and it is drawn to sit
 * at the same strength as the printed ones.
 */
const SOURCE = {
  front:
    "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
    "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony.pdf",
  back:
    "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
    "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony (tyły).pdf",
};

const FACES = [
  {
    id: "zly",
    // The word is cut from the same cell the plate is, so it goes back exactly
    // where it came from.
    from: "front",
    look: { left: 0.79, top: 0.28, right: 0.99, bottom: 0.33 },
  },
  {
    id: "dobry",
    // Second row, last column of the reverse, which is the one with nothing
    // printed near it — the Kamień cards' black artwork would swallow the ink
    // search anywhere else.
    from: "back",
    look: { left: 0.79, top: 0.24, right: 0.98, bottom: 0.47 },
  },
  {
    /**
     * After `DOBRY` rather than after `Zły`, because those two do not match
     * each other — Roman capitals on one face and a calligraphic italic on the
     * other — so there is no single house style to follow, and capitals are the
     * half a ten-letter word can be set in without becoming a scribble. Bodoni
     * is the Didone nearest what the sheet is set in.
     */
    id: "chaotyczny",
    drawn: "CHAOTYCZNY",
  },
];

/**
 * Where to go looking for the card, and how to know it when it is found.
 *
 * A region rather than the card's own edges, because `detectCells` cannot help
 * here — it looks for printed rules crossing the whole page, and this sheet is
 * cards floating on a blue field with no grid to find. So the constant is the
 * second row's last column, generously bounded, and the blue field inside it is
 * measured: cards elsewhere on this sheet sit against black artwork or against
 * each other, and this is the one with nothing but paper around it.
 *
 * Found rather than written down because the difference shows. A right margin
 * two pixels out is a card that looks trimmed on one side, and every attempt to
 * write the four edges as fractions of a 2480-wide render produced exactly
 * that.
 *
 * The region stops well above the row below, which is a blue block running the
 * whole width of the sheet: reach into it by a single line and the field this
 * finds is the whole page, with the neighbouring Zamieniony w Kamień card
 * inside it. Only the top of the card is cut anyway, so nothing is lost by not
 * looking that far down.
 */
const LOOK = { left: 0.78, top: 0.22, right: 1.0, bottom: 0.42 };

/**
 * Blue against white and black: more blue than red, and neither paper nor ink.
 *
 * The field comes off the scan at about #2d6e8f, which is a luminance of
 * ninety-four — near enough to the middle that a plain brightness test puts it
 * on whichever side the threshold happens to fall.
 */
const isField = (r, g, b) => b > r + 25 && (r * 299 + g * 587 + b * 114) / 1000 > 45;

/**
 * Two rectangles of the card's own white body, as fractions of the cut card.
 *
 * Both well inside it on every side, so that painting one out cannot touch the
 * frame and setting a word into the other cannot overrun onto the blue.
 *
 * They are not the same rectangle, and the difference is `Zły`'s tail. The
 * printed word measures 0.266 to 0.772 across and 0.344 to **0.794** down —
 * that last figure is the swash on the `y`, which drops most of the way to the
 * bottom of the crop and is a third of the word's height on its own. `erase`
 * has to clear all of it, and did not the first time: the word came back as a
 * ghost under `DOBRY`, because a band sized for lettering is not sized for
 * calligraphy.
 *
 * `word` is where the three words are then set, and it is smaller because it is
 * about placement rather than coverage. Its height is `Zły`'s own, so the one
 * word that came off this card goes back onto it the size it left.
 */
const ERASE = { left: 0.03, right: 0.97, top: 0.28, bottom: 0.88 };
const WORD = { left: 0.06, right: 0.94, top: 0.33, bottom: 0.78 };

/**
 * The shape every other illustration in the app is drawn in.
 *
 * `export-card-art.mjs` cuts 240x209 out of each card and every slot in the
 * pack, on the body and beside a name is built to it — so a Karta Zmiany
 * Natury cut to the same rectangle is one more card-shaped thing among the
 * card-shaped things, instead of the one object with proportions of its own.
 *
 * Which means the top of the card rather than all of it: this one is portrait
 * like everything in the box, and the part worth keeping is the shoulders and
 * the word. The rest is blank white card.
 */
const ART_RATIO = 240 / 209;
const OUT_WIDTH = 480;

/**
 * The drawn face, set to look like the printed one.
 *
 * `DOBRY` measures 373 wide by 136 tall — about 0.55 of the cap height per
 * letter, where Bodoni sets the same letters at about 0.76 — so the sheet's
 * lettering is condensed, and a word set at the face's own width stands out as
 * the one that is not from the box.
 *
 * Condensed harder than that arithmetic asks, and bold, for a reason the
 * arithmetic cannot see: `CHAOTYCZNY` is twice the word `DOBRY` is, so in a
 * rectangle of one size it is fitted by its width and comes out shorter — and
 * a shorter word at the same stroke weight reads as a lighter one. The squeeze
 * buys back the cap height and the weight buys back the colour.
 *
 * Rendered through sharp's SVG, which reaches the system's own fonts. Which
 * makes this macOS-only, like `sips` below and like every other script here.
 */
const DRAWN = { font: "Bodoni 72", weight: "bold", size: 200, squeeze: 0.5 };

/**
 * Sixty out of 255 finds black lettering and not the blue, which comes in at
 * about ninety-four — close enough that the obvious threshold of "darker than
 * half" takes the whole card and reports a word the size of the search box.
 */
const INK = 60;

/* ---------------------------------------------------------------------- */

/** sharp cannot open a PDF; sips renders one at the 2480 across everything else is read at. */
function render(sheet, id) {
  const out = `/tmp/mm-natura-${id}.png`;
  execFileSync(
    "sips",
    ["-s", "format", "png", "--resampleWidth", "2480", sheet, "--out", out],
    { stdio: "ignore" },
  );
  return out;
}

/** The tightest box round everything darker than `INK` inside `region`. */
async function inkIn(source, region) {
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
  if (x1 < 0) return null;
  return {
    left: region.left + x0,
    top: region.top + y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };
}

/** The tightest box round the blue the card is printed on, inside `region`. */
async function fieldIn(source, region) {
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
      if (!isField(data[at], data[at + 1], data[at + 2])) continue;
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

/** The tightest box round the card's white paper, in an image that is only the card. */
async function bodyIn(image) {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = info.width;
  let x1 = -1;
  // The middle row, which crosses the body between its notches: taking the
  // whole image would have the notched corners narrow the answer for no
  // reason, and the bands are set on a part of the card that is full width.
  const y = Math.round(info.height / 2);
  for (let x = 0; x < info.width; x++) {
    const at = (y * info.width + x) * info.channels;
    const lum = (data[at] * 299 + data[at + 1] * 587 + data[at + 2] * 114) / 1000;
    if (lum <= 200) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return x1 < 0 ? null : { left: x0, width: x1 - x0 + 1 };
}

/** A page with a word somewhere on it, whether it was printed there or set here. */
function pageFor(face, sheets) {
  if (!face.drawn) return { source: sheets[face.from], temporary: false };

  // Room to spare all round, because the ink search is what decides where the
  // word actually is — a canvas fitted to a guess at the text's width is a
  // guess that clips a letter.
  const box = { width: DRAWN.size * face.drawn.length, height: DRAWN.size * 2 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">
    <rect width="${box.width}" height="${box.height}" fill="#ffffff"/>
    <g transform="translate(${box.width / 2} ${box.height / 2}) scale(${DRAWN.squeeze} 1)">
      <text x="0" y="0" font-family="${DRAWN.font}" font-size="${DRAWN.size}"
            font-weight="${DRAWN.weight}" text-anchor="middle"
            dominant-baseline="central" fill="#111111">${face.drawn}</text>
    </g>
  </svg>`;
  return { source: Buffer.from(svg), temporary: false };
}

/* ---------------------------------------------------------------------- */

for (const sheet of Object.values(SOURCE)) {
  if (fs.existsSync(sheet)) continue;
  console.warn(`nothing to do — no ${sheet}`);
  process.exit(0);
}

const sheets = {
  front: render(SOURCE.front, "front"),
  back: render(SOURCE.back, "back"),
};

// The card, cut to the app's own rectangle: the whole width of its blue field,
// and as much of the height as that rectangle holds, from the top of the blue
// down. The card is portrait, like everything else in this box, so what is kept
// is the shoulders and the word and what is dropped is blank white paper.
const page = await sharp(sheets.front).metadata();
const field = await fieldIn(sheets.front, {
  left: Math.round(page.width * LOOK.left),
  top: Math.round(page.height * LOOK.top),
  width: Math.round(page.width * (LOOK.right - LOOK.left)),
  height: Math.round(page.height * (LOOK.bottom - LOOK.top)),
});
if (!field) throw new Error("no blue field where the Karta Zmiany Natury should be");
const cell = {
  ...field,
  height: Math.min(field.height, Math.round(field.width / ART_RATIO)),
};

const out = { width: OUT_WIDTH, height: Math.round(OUT_WIDTH / ART_RATIO) };
const card = await sharp(sheets.front).extract(cell).resize(out.width, out.height).png().toBuffer();

/**
 * The white body, found rather than assumed.
 *
 * Both bands are horizontally bounded by this and not by the cut, and the
 * difference between the two is the blue margin — which is what the first
 * attempt painted over. `ERASE.right` of 0.96 sounded safely inside a card that
 * fills the frame; the card fills 0.92 of it, and the other 0.04 is the frame
 * itself. It came out as a step in the blue strip a third of the way up.
 */
const body = await bodyIn(card);
if (!body) throw new Error("no white card inside the blue field");

const rect = (box) => ({
  left: body.left + Math.round(body.width * box.left),
  top: Math.round(out.height * box.top),
  width: Math.round(body.width * (box.right - box.left)),
  height: Math.round(out.height * (box.bottom - box.top)),
});
const erase = rect(ERASE);
const band = rect(WORD);

/**
 * The card with nothing written on it.
 *
 * The white being painted on is the card's own white — the body is flat paper
 * between the notches — so this is an erasure and not a patch, and the seam it
 * would otherwise leave does not exist to be seen.
 */
const plate = await sharp(card)
  .composite([
    {
      input: { create: { ...erase, channels: 3, background: "#ffffff" } },
      left: erase.left,
      top: erase.top,
    },
  ])
  .png()
  .toBuffer();

fs.mkdirSync("public/cards", { recursive: true });

for (const face of FACES) {
  const { source } = pageFor(face, sheets);
  const { width, height } = await sharp(source).metadata();
  // The drawn page holds nothing but the word, so the whole of it is where to
  // look; the sheets need telling which card.
  const region = face.look
    ? {
        left: Math.round(width * face.look.left),
        top: Math.round(height * face.look.top),
        width: Math.round(width * (face.look.right - face.look.left)),
        height: Math.round(height * (face.look.bottom - face.look.top)),
      }
    : { left: 0, top: 0, width, height };

  const ink = await inkIn(source, region);
  if (!ink) {
    console.warn(`skipped ${face.id} — no ink in the search box`);
    continue;
  }

  // Fitted inside the rectangle and centred in it, so three words of three
  // very different shapes all sit in the one place the card has for a word.
  const word = await sharp(source)
    .extract(ink)
    .resize({ ...band, fit: "inside" })
    .toBuffer({ resolveWithObject: true });

  const file = `public/cards/natura-${face.id}.jpg`;
  await sharp(plate)
    .composite([
      {
        input: word.data,
        left: band.left + Math.round((band.width - word.info.width) / 2),
        top: band.top + Math.round((band.height - word.info.height) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toFile(file);

  console.log(`${file} — ${out.width}x${out.height}, word ${ink.width}x${ink.height}`);
}

for (const sheet of Object.values(sheets)) fs.rmSync(sheet, { force: true });

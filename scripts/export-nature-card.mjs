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
    // Looked for on the card itself rather than in a region of the sheet: the
    // card is already cut by then, the word is the only ink on it, and a word
    // that came off this card goes back onto it without a second measurement
    // to get wrong.
    from: "front",
    onCard: true,
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
 * second row's last column, bounded tightly enough to hold nothing else, and
 * the white card inside it is measured.
 *
 * White and not blue, which took a detour to arrive at. The blue reads as the
 * obvious thing to find — it is the card's own field — but on this sheet it is
 * not the card's alone: the row beneath is a blue block running the full width,
 * joined to this one, so a search that reaches even one line into it comes back
 * with a field the size of the page and the Zamieniony w Kamień card inside it.
 * The white body has edges of its own, and the border is built here anyway.
 *
 * Bounded above the row of Zdarzenia as well: their white is white too, and a
 * region that starts one line into them begins the card several hundred pixels
 * too high.
 */
const LOOK = { left: 0.79, top: 0.243, right: 0.975, bottom: 0.465 };

/**
 * Two rectangles of the card's white body, as fractions of it.
 *
 * `erase` has to clear the printed word and nothing else. It stops short of the
 * notches — the die-cut quarter-circles at the four corners, which reach about
 * a ninth of the way down — because painting white into one fills it in and the
 * card loses the corner that makes it a card.
 *
 * It also has to clear all of `Zły`, which is more than it sounds: the word
 * measures 0.216 to 0.822 across and 0.149 to **0.414** down, and that last
 * figure is the swash on the `y`. Sized for lettering rather than for
 * calligraphy, the first attempt left the tail showing as a ghost under
 * `DOBRY`.
 *
 * The two are measured against different things, because they happen at
 * different moments. `erase` is fractions of the card as printed and is painted
 * on before the squash, since what it has to cover is printed at those
 * proportions. `word` is fractions of the squashed card and is set on after,
 * because the lettering is the one thing here that must *not* be squashed: a
 * frame can be any shape and still read as a frame, and a word cannot.
 *
 * `word` is also not where the printed one sat. The upper third is what a tall
 * card does with a short word; in a landscape frame it is a word pinned near
 * the top with half the card empty under it. Faithful placement stops meaning
 * anything once the proportions are gone, so it is centred.
 */
const ERASE = { left: 0.04, right: 0.96, top: 0.13, bottom: 0.50 };
const WORD = { left: 0.09, right: 0.91, top: 0.18, bottom: 0.74 };

/**
 * The shape every other illustration in the app is drawn in.
 *
 * `export-card-art.mjs` cuts 240x209 out of each card, and every slot in the
 * pack, on the body and beside a name is built to it — so a Karta Zmiany Natury
 * cut to the same rectangle is one more card-shaped thing among the card-shaped
 * things, instead of the one object with proportions of its own.
 *
 * The card is portrait, like everything in this box, so something has to give.
 * Cropping it to the top was the first answer and it was the wrong one: it
 * keeps the shoulders and throws the other two corners away, which is a card
 * with its bottom out of frame rather than a card. It is squashed instead —
 * every proportion in it wrong by the same amount, which is the kind of wrong
 * the eye forgives, and all four corners still there.
 *
 * The border is then built rather than cut, which is the only way it comes out
 * even. Squashing a card that already has its printed margin squashes the
 * margin too, and the top and bottom of the frame end up half the width of the
 * sides.
 */
const ART_RATIO = 240 / 209;
const OUT_WIDTH = 480;
const BORDER = 0.075;

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

/** The blue the card is printed on, taken from just outside its own edge. */
async function fieldColour(source, paper) {
  const { data } = await sharp(source)
    .extract({
      left: Math.max(0, paper.left - 12),
      top: paper.top + Math.round(paper.height / 2),
      width: 4,
      height: 4,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
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

/**
 * The card itself: the white paper and the four notches cut into its corners,
 * and not one pixel of margin.
 *
 * The margin is made further down instead, which is what lets it come out even
 * — see BORDER. Everything between here and there happens at the card's own
 * resolution, so the words are set on it before it is squashed and get squashed
 * with it. Composited afterwards they would stand upright on a card that does
 * not, which is the one thing that reads as a mistake rather than as a choice.
 */
const page = await sharp(sheets.front).metadata();
const paper = await paperIn(sheets.front, {
  left: Math.round(page.width * LOOK.left),
  top: Math.round(page.height * LOOK.top),
  width: Math.round(page.width * (LOOK.right - LOOK.left)),
  height: Math.round(page.height * (LOOK.bottom - LOOK.top)),
});
if (!paper) throw new Error("no white card where the Karta Zmiany Natury should be");

const blue = await fieldColour(sheets.front, paper);
const card = await sharp(sheets.front).extract(paper).png().toBuffer();

const erase = {
  left: Math.round(paper.width * ERASE.left),
  top: Math.round(paper.height * ERASE.top),
  width: Math.round(paper.width * (ERASE.right - ERASE.left)),
  height: Math.round(paper.height * (ERASE.bottom - ERASE.top)),
};

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

/**
 * The blank card, squashed to the app's rectangle and framed in an even margin
 * of its own blue. Three faces, one plate: this is made once.
 */
const out = { width: OUT_WIDTH, height: Math.round(OUT_WIDTH / ART_RATIO) };
const margin = Math.round(OUT_WIDTH * BORDER);
const blank = await sharp(plate)
  .resize(out.width - margin * 2, out.height - margin * 2, { fit: "fill" })
  .extend({ top: margin, bottom: margin, left: margin, right: margin, background: blue })
  .png()
  .toBuffer();

// Where a word goes on the finished card, which is where the card is inside its
// own frame and then `WORD` inside that.
const inner = { width: out.width - margin * 2, height: out.height - margin * 2 };
const band = {
  left: margin + Math.round(inner.width * WORD.left),
  top: margin + Math.round(inner.height * WORD.top),
  width: Math.round(inner.width * (WORD.right - WORD.left)),
  height: Math.round(inner.height * (WORD.bottom - WORD.top)),
};

fs.mkdirSync("public/cards", { recursive: true });

for (const face of FACES) {
  const { source } = pageFor(face, sheets);
  const { width, height } = await sharp(source).metadata();
  // The drawn page holds nothing but the word, so the whole of it is where to
  // look; the sheets need telling which card.
  const region = face.onCard
    ? paper
    : face.look
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
  await sharp(blank)
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

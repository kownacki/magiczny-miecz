/** Cuts the one card back the box actually prints out of the sheet that carries it. */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * Where the back lives, which is not where you would look for it.
 *
 * There is no "Karty Zdarzeń (tyły)" sheet. The five ZDARZENIE backs share a
 * page with the Zamieniony w Kamień cards, the Dobry/Zły markers and the
 * character standees — everything printed on the reverse of sheet 9, gathered
 * onto one sheet because that is how a print run works, not because they belong
 * together.
 *
 * The expansions each carry the same back (Gród's own tyły sheet has ten of
 * them, identical), so nothing has to be borrowed from a folder that is
 * deliberately out of scope: the base game already has its own.
 */
const SHEET =
  "assets/raw/MM - Magiczny Miecz/Zdarzenia/" +
  "MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony (tyły).pdf";
const OUT = "public/cards/back.jpg";

/**
 * The first card on the sheet, as a fraction of the page.
 *
 * Measured off the render rather than detected: the slicer in
 * `extract-assets.mjs` finds printed cut lines, and this sheet has four
 * different card shapes on it, so it cuts them roughly. One card is wanted, in
 * one place, and the numbers are checkable by looking at what comes out.
 */
const CARD = { left: 0.0255, top: 0.0245, right: 0.2145, bottom: 0.2285 };

/** Wide enough for the largest place a back is drawn — a pile in the Talie view. */
const WIDTH = 460;

const png = "/tmp/mm-back-sheet.png";
execFileSync("sips", ["-s", "format", "png", "--resampleWidth", "2480", SHEET, "--out", png], {
  stdio: "ignore",
});

const sheet = sharp(png);
const { width, height } = await sheet.metadata();
const box = {
  left: Math.round(width * CARD.left),
  top: Math.round(height * CARD.top),
  width: Math.round(width * (CARD.right - CARD.left)),
  height: Math.round(height * (CARD.bottom - CARD.top)),
};

fs.mkdirSync("public/cards", { recursive: true });
await sharp(png).extract(box).resize({ width: WIDTH }).jpeg({ quality: 88 }).toFile(OUT);
fs.rmSync(png, { force: true });

const out = await sharp(OUT).metadata();
console.log(`${OUT} — ${out.width}x${out.height} from ${width}x${height}`);

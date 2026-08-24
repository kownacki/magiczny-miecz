/** Turns the native card slices into web-sized images the app can show, keyed by slice reference. */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const IN = "assets/extracted";
const OUT = "public/cards";

/**
 * Width in CSS pixels the card is displayed at, doubled for retina. Card text
 * has to stay readable — that is the entire point of showing the image rather
 * than the transcription — so this is generous.
 */
const WIDTH = 420;

/** JPEG quality. Above ~75 the files grow faster than the scans deserve. */
const QUALITY = 72;

/**
 * Sheets worth exporting. Boards, rulebook pages and standee sheets are not
 * cards and would each be megabytes.
 */
const CARD_SHEETS = /^(zdarzenia-\d|zaklecia|wyposazenie|wyposazenie-zaklecia|postacie-\d)$/;

/**
 * Uses macOS `sips` for the resize and JPEG encode.
 *
 * The rest of the pipeline is deliberately dependency-free, but writing a JPEG
 * encoder by hand to save one built-in tool would be silly. This is a one-time
 * generation step whose *output* is committed, so nobody needs a Mac to run the
 * app — only to regenerate the images.
 */
function convert(source, destination) {
  execFileSync("sips", [
    "-s", "format", "jpeg",
    "-s", "formatOptions", String(QUALITY),
    "-Z", String(WIDTH),
    source,
    "--out", destination,
  ], { stdio: "ignore" });
}

function run() {
  if (!fs.existsSync(IN)) {
    console.error(`${IN} is missing — run scripts/extract-assets.mjs first.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  let written = 0;
  let bytes = 0;
  const manifest = [];

  for (const sheet of fs.readdirSync(IN).sort()) {
    if (!CARD_SHEETS.test(sheet)) continue;
    const dir = path.join(IN, sheet);
    if (!fs.statSync(dir).isDirectory()) continue;

    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith(".png")) continue;
      // "zdarzenia-6-20.png" is slice 20 of sheet zdarzenia-6, which is the
      // reference the deck and the turn state use: "zdarzenia-6#20".
      const match = file.match(/^(.+)-(\d+)\.png$/);
      if (!match) continue;
      const [, sheetId, index] = match;

      const destination = path.join(OUT, `${sheetId}-${index}.jpg`);
      convert(path.join(dir, file), destination);
      bytes += fs.statSync(destination).size;
      written++;
      manifest.push(`${sheetId}#${Number(index)}`);
    }
    console.log(`${sheet}: exported`);
  }

  // Committed so the app can tell "no image for this card" from "image not
  // generated yet" without a filesystem probe at request time.
  fs.writeFileSync(
    path.join("src/data", "card-images.json"),
    JSON.stringify(manifest.sort(), null, 0) + "\n",
  );

  console.log(`\n${written} images, ${(bytes / 1024 / 1024).toFixed(1)} MB -> ${OUT}`);
}

run();

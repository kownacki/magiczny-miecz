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

/**
 * Character cards are read, not glanced at.
 *
 * A player sits with their own Karta Postaci open beside them for the whole
 * game and reads four numbered clauses of Charakterystyka off it. At 420 the
 * print is a grey suggestion, and the scan has 777 to give — so it gives it.
 * Nothing else on any sheet is looked at for that long.
 */
const WIDTH_BY_SHEET = { "postacie-1": 780, "postacie-2": 780, "postacie-3": 780 };

/** JPEG quality. Above ~75 the files grow faster than the scans deserve. */
const QUALITY = 72;

/**
 * Sheets worth exporting. Boards, rulebook pages and standee sheets are not
 * cards and would each be megabytes.
 */
const CARD_SHEETS =
  /^(zdarzenia-\d|zaklecia|wyposazenie|wyposazenie-zaklecia|postacie-\d|standee)$/;

/**
 * Uses macOS `sips` for the resize and JPEG encode.
 *
 * The rest of the pipeline is deliberately dependency-free, but writing a JPEG
 * encoder by hand to save one built-in tool would be silly. This is a one-time
 * generation step whose *output* is committed, so nobody needs a Mac to run the
 * app — only to regenerate the images.
 */
function convert(source, destination, width) {
  execFileSync("sips", [
    "-s", "format", "jpeg",
    "-s", "formatOptions", String(QUALITY),
    "-Z", String(width),
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
      convert(path.join(dir, file), destination, WIDTH_BY_SHEET[sheetId] ?? WIDTH);
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

  // Characters are looked up by id rather than by slice — a player picks
  // "krasnolud", not "postacie-2#5" — so they get their own map.
  const characters = JSON.parse(fs.readFileSync("src/data/characters.json", "utf8"));
  const portraits = Object.fromEntries(
    characters
      .map((character) => {
        const { sheet, index } = character.source;
        const ref = `${sheet}#${index}`;
        return manifest.includes(ref) ? [character.id, ref] : null;
      })
      .filter(Boolean),
  );
  fs.writeFileSync(
    path.join("src/data", "character-images.json"),
    JSON.stringify(portraits, null, 2) + "\n",
  );
  console.log(`${Object.keys(portraits).length} character portraits mapped`);

  // The małe Karty Postaci — "na których znajduje się tylko ilustracja"
  // (Przygotowanie do gry). These are the ones that go in the plastic stands
  // and stand on the board, so they are what a player recognises their piece
  // by, and what belongs anywhere a character is shown small.
  //
  // They come from `scripts/build-standees.mjs`, which gathers them off the two
  // sheets the publisher split them across and cuts them all to one size. In
  // character order, so the Nth character is the Nth standee.
  const standees = Object.fromEntries(
    characters
      .map((character, i) => [character.id, `standee#${i + 1}`])
      .filter(([, ref]) => manifest.includes(ref)),
  );
  if (Object.keys(standees).length !== characters.length) {
    // Loud rather than silent: a short sheet would otherwise hand some
    // characters no picture and — worse, if the order slipped — the wrong one,
    // which reads as a data-entry bug somewhere else entirely.
    console.warn(
      `only ${Object.keys(standees).length}/${characters.length} standees found` +
        " — run scripts/build-standees.mjs",
    );
  }
  fs.writeFileSync(
    path.join("src/data", "character-standees.json"),
    JSON.stringify(standees, null, 2) + "\n",
  );
  console.log(`${Object.keys(standees).length} character standees mapped`);

  console.log(`\n${written} images, ${(bytes / 1024 / 1024).toFixed(1)} MB -> ${OUT}`);
}

run();

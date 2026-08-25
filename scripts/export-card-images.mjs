/** Turns the native card slices into web-sized images the app can show, keyed by slice reference. */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const IN = "assets/extracted";
const OUT = "public/cards";

/**
 * Longest side of a card, sized for the place it is read: the hover panel.
 *
 * That panel shows a card 260 CSS px wide, which is 520 device px on a retina
 * screen. At the old 420 the cards came out 252 across and were being blown up
 * 2.06x to fill it — blurry, and inconsistent besides, because Karty Postaci
 * were already exported big enough and rendered sharp beside them.
 *
 * 880 puts a card at 528 across, which clears 520 with nothing to spare and
 * nothing wasted.
 */
const WIDTH = 880;

/**
 * Character cards are read, not glanced at.
 *
 * A player sits with their own Karta Postaci open beside them for the whole
 * game and reads four numbered clauses of Charakterystyka off it. At 420 the
 * print is a grey suggestion, and the scan has 777 to give — so it gives it.
 * Nothing else on any sheet is looked at for that long.
 */
const WIDTH_BY_SHEET = {
  karta: 780,
  /**
   * Standees are never read, only recognised.
   *
   * The biggest one on screen is the active chip in the turn bar at 85px, and
   * the paper doll draws them at 96. 420 already covers twice that; giving them
   * the card treatment would quadruple 28 files nobody looks closely at.
   */
  standee: 420,
};

/** JPEG quality. Above ~75 the files grow faster than the scans deserve. */
const QUALITY = 72;

/**
 * Sheets worth exporting. Boards, rulebook pages and standee sheets are not
 * cards and would each be megabytes.
 */
const CARD_SHEETS =
  /^(zdarzenia-\d|zaklecia|wyposazenie|wyposazenie-zaklecia|karta|standee)$/;

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
  // Both sets come from `scripts/build-character-cards.mjs`, which re-cuts them
  // off sheets the generic slicer could not handle and puts them in character
  // order — so the Nth character is the Nth card of each kind. `character.source`
  // still records which printed sheet it came from; it is provenance, not a
  // lookup.
  const characters = JSON.parse(fs.readFileSync("src/data/characters.json", "utf8"));
  const portraits = Object.fromEntries(
    characters
      .map((character, i) => [character.id, `karta#${i + 1}`])
      .filter(([, ref]) => manifest.includes(ref)),
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
        " — run scripts/build-character-cards.mjs",
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

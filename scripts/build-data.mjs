/** Merges the per-sheet transcriptions into the typed decks the app loads, and fails loudly when the counts stop matching the rulebook. */

import fs from "node:fs";
import path from "node:path";

const RAW = "src/data/raw";
const OUT = "src/data";

/**
 * What the rulebook says is in the box (page 3, "CO NALEŻY ZABRAĆ NA WYPRAWĘ").
 * These are assertions, not documentation: a transcription pass that loses or
 * duplicates a card shows up here rather than as a subtly wrong game months
 * later.
 */
const EXPECTED = {
  events: 165,
  spells: 30,
  items: 30,
  characters: 27,
  natureChange: 4,
  stone: 4,
};

/**
 * Hand-supplied names for the fourteen cards whose title was never filled in
 * before the print files went out — they carry the literal string "NAZWA
 * KARTY". Keeping the fix here rather than in the transcriptions means
 * src/data/raw stays a faithful record of what is actually printed, and the
 * editorial decision stays visible and reversible.
 */
const overrides = JSON.parse(fs.readFileSync(path.join(OUT, "overrides.json"), "utf8"));

function readSheet(name) {
  const file = path.join(RAW, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  const cards = JSON.parse(fs.readFileSync(file, "utf8"));
  return cards.map((card) => {
    const override = overrides.names[`${name}#${card.source?.index}`];
    return override ? { ...card, ...override } : card;
  });
}

const problems = [];

function note(message) {
  problems.push(message);
}

// --- events -----------------------------------------------------------------

const eventSheets = Array.from({ length: 9 }, (_, i) => `zdarzenia-${i + 1}`);
const events = [];
const markers = { natureChange: [], stone: [], standees: [] };

for (const sheet of eventSheets) {
  for (const card of readSheet(sheet)) {
    // Sheet 9 mixes real cards with the nature-change and turned-to-stone
    // markers and the character standees, so it is the only one that carries a
    // `kind` discriminator. Everything else is an event card by construction.
    const kind = card.kind ?? "event";
    if (kind === "event") {
      events.push(normaliseEvent(card));
    } else if (kind === "nature-change") {
      markers.natureChange.push(card);
    } else if (kind === "stone") {
      markers.stone.push(card);
    } else if (kind === "standee") {
      markers.standees.push(card);
    } else {
      note(`${sheet} #${card.source?.index}: unexpected kind "${kind}"`);
    }
  }
}

function normaliseEvent(card) {
  const out = {
    id: card.id,
    name: card.name,
    cardClass: card.cardClass,
    source: card.source,
    text: card.text,
  };
  if (typeof card.miecz === "number") out.miecz = card.miecz;
  if (typeof card.magia === "number") out.magia = card.magia;
  // "Przedmiot V Magiczny" against "Przedmiot V Przedmiot" — the class name is
  // split around the numeral in the header band, and the right-hand half is the
  // whole of the distinction. Carried through from the transcription because
  // three rules turn on it and none of them can read a picture.
  if (card.magical === true) out.magical = true;
  return out;
}

// --- spells and items -------------------------------------------------------

// Both live across three sheets and two of those mix the kinds, so they are
// split by what each card said it was rather than by which sheet it came from.
const spells = [];
const items = [];

for (const sheet of ["zaklecia", "wyposazenie", "wyposazenie-zaklecia"]) {
  for (const card of readSheet(sheet)) {
    const base = { id: card.id, name: card.name, source: card.source, text: card.text };
    if (card.kind === "spell") {
      // One transcription pass suffixed duplicate spells ("siedem-wichrow-2")
      // to keep ids unique within its own file. That contradicts the rule the
      // rest of the data follows: duplicates SHARE an id and are told apart by
      // the slice they came from, because they are the same printed card.
      spells.push({ ...base, id: base.id.replace(/-\d+$/, "") });
    } else if (card.kind === "item") {
      const item = { ...base };
      if (typeof card.miecz === "number") item.miecz = card.miecz;
      if (typeof card.magia === "number") item.magia = card.magia;
      if (typeof card.price === "number") item.price = card.price;
      if (card.magical === true) item.magical = true;
      if (Array.isArray(card.forbiddenTo)) item.forbiddenTo = card.forbiddenTo;
      items.push(item);
    } else {
      note(`${sheet} #${card.source?.index}: unexpected kind "${card.kind}"`);
    }
  }
}

// --- characters -------------------------------------------------------------

const characters = [];
for (const sheet of ["postacie-1", "postacie-2", "postacie-3"]) {
  for (const card of readSheet(sheet)) {
    characters.push(card);
    for (const field of ["miecz", "magia"]) {
      if (typeof card[field] !== "number") {
        note(`${card.name}: missing ${field}`);
      }
    }
    if (!card.start) note(`${card.name}: missing MGR starting field`);
    if (!["good", "evil", "chaotic", "any"].includes(card.nature)) {
      note(`${card.name}: unexpected nature "${card.nature}"`);
    }
  }
}

// --- checks -----------------------------------------------------------------

const counts = {
  events: events.length,
  spells: spells.length,
  items: items.length,
  characters: characters.length,
  natureChange: markers.natureChange.length,
  stone: markers.stone.length,
};

for (const [key, expected] of Object.entries(EXPECTED)) {
  if (counts[key] !== expected) {
    note(`${key}: got ${counts[key]}, rulebook says ${expected}`);
  }
}

// A card is identified by where it was sliced from, never by its name — the
// deck contains genuine duplicates (four "1 SZTUKA ZŁOTA", two "UPIÓR"), so ids
// repeat by design and only sheet+index is unique.
const seen = new Set();
for (const card of [...events, ...spells, ...items, ...characters]) {
  const key = `${card.source.sheet}#${card.source.index}`;
  if (seen.has(key)) note(`duplicate slice reference ${key}`);
  seen.add(key);
}

// Cards whose printed name is the unfilled template placeholder. They are real
// cards with real rules text; only the title was never set in the print files,
// so they need naming by hand from their body text.
const placeholders = [...items, ...spells, ...events].filter(
  (c) => c.name === "NAZWA KARTY",
);

// --- write ------------------------------------------------------------------

const write = (name, value) =>
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(value, null, 2) + "\n");

write("events", events);
write("spells", spells);
write("items", items);
write("characters", characters);
write("markers", markers);

console.log("counts:", counts);
if (placeholders.length) {
  console.log(
    `\n${placeholders.length} cards still print the "NAZWA KARTY" placeholder and need naming:`,
  );
  for (const card of placeholders) {
    console.log(`  ${card.source.sheet}#${card.source.index}: ${card.text.slice(0, 70)}...`);
  }
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\nall counts match the rulebook");
}

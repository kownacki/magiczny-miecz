/** Turns the raw scans in assets/raw into per-card images plus a catalogue, so nothing downstream has to touch a PDF. */

import fs from "node:fs";
import path from "node:path";
import { extractImages } from "./lib/pdf-images.mjs";
import { detectCells } from "./lib/grid.mjs";
import { encodePng, cropImage, isBlank } from "./lib/png.mjs";

const RAW = "assets/raw/MM - Magiczny Miecz";
const OUT = "assets/extracted";

/**
 * Which sheets hold a grid of cards and which are single images. `slice: false`
 * sheets are boards, character sheets printed as one plate, or token sheets —
 * they get extracted whole and cropped later by hand if at all.
 *
 * `bleed` trims the printed cut line itself off each card so the slices do not
 * carry a black edge from their neighbour.
 */
const SHEETS = [
  { file: "MM - MAGICZNY MIECZ.pdf", id: "rulebook", kind: "rulebook", slice: false },
  { file: "MM - MAGICZNY MIECZ - Plansza.pdf", id: "board", kind: "board", slice: false },

  ...range(1, 8).map((n) => ({
    file: `Zdarzenia/MM - MAGICZNY MIECZ - Zdarzenia ${n}.pdf`,
    id: `zdarzenia-${n}`,
    kind: "event",
    slice: true,
  })),
  {
    file: "Zdarzenia/MM - MAGICZNY MIECZ - Zdarzenia 9 Dobry-zły Kamień Piony.pdf",
    id: "zdarzenia-9",
    kind: "event-mixed",
    slice: true,
  },

  {
    file: "Wyposażenie i Zaklęcia/MM - MAGICZNY MIECZ - Zaklęcia.pdf",
    id: "zaklecia",
    kind: "spell",
    slice: true,
  },
  {
    file: "Wyposażenie i Zaklęcia/MM - MAGICZNY MIECZ - Wyposażenie.pdf",
    id: "wyposazenie",
    kind: "item",
    slice: true,
  },
  {
    file: "Wyposażenie i Zaklęcia/MM - MAGICZNY MIECZ - Wyposażenie i Zaklęcia.pdf",
    id: "wyposazenie-zaklecia",
    kind: "item-mixed",
    slice: true,
  },

  ...range(1, 3).map((n) => ({
    file: `Postacie/MM - MAGICZNY MIECZ - Postacie ${n}.pdf`,
    id: `postacie-${n}`,
    kind: "character",
    slice: true,
  })),
  {
    file: "Postacie/MM - MAGICZNY MIECZ - Piony Postaci.pdf",
    id: "piony",
    kind: "standee",
    slice: false,
  },
];

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const BLEED = 6;

function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const catalogue = [];

  for (const sheet of SHEETS) {
    const source = path.join(RAW, sheet.file);
    if (!fs.existsSync(source)) {
      console.warn(`missing: ${sheet.file}`);
      continue;
    }
    const images = extractImages(fs.readFileSync(source));
    if (images.length === 0) {
      console.warn(`no image found in: ${sheet.file}`);
      catalogue.push({ ...sheet, pages: 0, cards: 0, note: "no extractable image" });
      continue;
    }

    if (!sheet.slice) {
      const dir = path.join(OUT, sheet.id);
      fs.mkdirSync(dir, { recursive: true });
      images.forEach((img, i) => {
        const name = images.length === 1 ? `${sheet.id}.png` : `${sheet.id}-${pad(i + 1)}.png`;
        fs.writeFileSync(path.join(dir, name), encodePng(img));
      });
      catalogue.push({
        id: sheet.id,
        kind: sheet.kind,
        source: sheet.file,
        pages: images.length,
        cards: 0,
        size: [images[0].width, images[0].height],
      });
      console.log(`${sheet.id}: ${images.length} page(s) @ ${images[0].width}x${images[0].height}`);
      continue;
    }

    const img = images[0];
    const cells = detectCells(img);
    const cols = cells.columns.length;
    const rows = cells.rows.length;
    const dir = path.join(OUT, sheet.id);
    fs.mkdirSync(dir, { recursive: true });

    let n = 0;
    let blanks = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [cx, cw] = cells.columns[c];
        const [cy, ch] = cells.rows[r];
        const x = cx + BLEED;
        const y = cy + BLEED;
        const w = cw - BLEED * 2;
        const h = ch - BLEED * 2;
        const cell = cropImage(img, x, y, w, h);
        if (isBlank(cell)) {
          blanks++;
          continue;
        }
        n++;
        fs.writeFileSync(path.join(dir, `${sheet.id}-${pad(n)}.png`), encodePng(cell));
      }
    }
    catalogue.push({
      id: sheet.id,
      kind: sheet.kind,
      source: sheet.file,
      pages: 1,
      grid: [cols, rows],
      cards: n,
      blanks,
      size: [img.width, img.height],
    });
    console.log(`${sheet.id}: ${cols}x${rows} grid -> ${n} cards${blanks ? ` (${blanks} blank)` : ""}`);
  }

  fs.writeFileSync(
    path.join(OUT, "catalogue.json"),
    JSON.stringify({ generatedFrom: RAW, sheets: catalogue }, null, 2) + "\n",
  );
  const total = catalogue.reduce((sum, s) => sum + (s.cards ?? 0), 0);
  console.log(`\n${catalogue.length} sheets, ${total} card images -> ${OUT}`);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

run();

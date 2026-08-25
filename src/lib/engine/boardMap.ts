/** Where every field sits on the drawn map, and the clockwise sense the printed board actually uses. */

import { DOLNY_KRAG, KAMIENNY_MOST, type FieldId } from "./board";
import { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";

/**
 * The map is drawn, not photographed.
 *
 * The scan is 67 MB, gitignored, and carries its field names at every rotation
 * a player sitting around a table might read them from — which makes it
 * unreadable at the size a map has to be, and unusable on a phone. What the
 * table actually needs from a map is *positions*: who is where, what is next to
 * what, and which way round the ring you are about to walk. A schematic gives
 * all three at a glance and needs no assets at all.
 *
 * The geometry below is nonetheless taken from the board: the three rings are
 * concentric rectangular tracks, the field order and which side of the board
 * each field sits on were read off the scan, and boardMap.test.ts checks the
 * sides against the ring arrays so the two cannot drift apart.
 */

/** The drawing surface. Portrait, in the proportion of the printed board. */
export const VIEW = { width: 1000, height: 1420 } as const;

export interface Cell {
  id: FieldId;
  name: string;
  /** Which track it belongs to, for colouring. */
  region: "gorny" | "srodkowy" | "dolny" | "most";
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Which fields sit on which side of the board, clockwise from the top-left.
 *
 * Read off the board scan edge by edge. `top` and `bottom` span the full width
 * and so own the corners; `right` and `left` are the cells between them. Listed
 * in the direction of travel — top left-to-right, right downwards, bottom
 * right-to-left, left upwards — so concatenating the four gives one clockwise
 * lap, which is exactly what the test compares against the ring arrays.
 */
interface Sides {
  top: FieldId[];
  right: FieldId[];
  bottom: FieldId[];
  left: FieldId[];
}

export const GORNY_SIDES: Sides = {
  top: ["urwisko-1", "ruiny-twierdzy", "swiatynia-tolimana"],
  right: [
    "dolina-czaszek",
    "bagna-1",
    "ruchome-skaly-1",
    "urwisko-2",
    "rownina-traw",
    "rozstajne-drogi-1",
  ],
  bottom: ["zamek", "wymarle-miasto", "ruchome-skaly-2"],
  left: [
    "bagna-2",
    "krypta-upiorow",
    "rownina-snu",
    "rozstajne-drogi-2",
    "kamienny-las",
    "wilczy-parow",
  ],
};

export const SRODKOWY_SIDES: Sides = {
  // The bridge crosses the board between these two, which is why the middle
  // ring's short sides carry two fields where the outer ring carries three.
  top: ["twierdza-strzegaca-drog", "przelecz-wichrow"],
  right: [
    "przeprawa-1",
    "dolina-cienia",
    "wrzosowiska",
    "wieza-przeznaczenia",
    "straznik-magicznych-wrot",
    "magiczne-wrota",
  ],
  bottom: ["plaskowyz-mgiel", "swiatynia-bogini-nemed"],
  left: [
    "zaczarowane-wzgorza",
    "las-blednych-ogni",
    "pustelnia",
    "rownina-samotnych-skal",
    "przeprawa-2",
    "mroczna-polana",
  ],
};

export const DOLNY_SIDES: Sides = {
  top: ["osada", "step-1", "mokradla-1"],
  right: ["czarci-mlyn", "krag-mocy", "studnia-wiecznosci", "bezdroza"],
  bottom: ["grod", "mrozne-pustkowie", "karczma"],
  left: ["uroczysko", "step-2", "mokradla-2", "kurhan"],
};

/** One clockwise lap of a ring, in the order a figure walks it on the table. */
export function clockwise(sides: Sides): FieldId[] {
  return [...sides.top, ...sides.right, ...sides.bottom, ...sides.left];
}

const BAND = 128;
const DOLNY_BAND = 118;

const GORNY_RECT: Rect = { x0: 0, y0: 0, x1: VIEW.width, y1: VIEW.height };
const SRODKOWY_RECT: Rect = {
  x0: BAND,
  y0: BAND,
  x1: VIEW.width - BAND,
  y1: VIEW.height - BAND,
};
const DOLNY_RECT: Rect = {
  x0: BAND * 2,
  y0: BAND * 2,
  x1: VIEW.width - BAND * 2,
  y1: VIEW.height - BAND * 2,
};

/**
 * The Kamienny Most, drawn down the middle of the board's empty centre.
 *
 * On the printed board the bridge is a straight line across the whole board and
 * physically interrupts the top and bottom edges of the rings it crosses.
 * Drawing it that way would put a nine-cell corridor through three tracks and
 * force awkward gaps in each; drawing it inside the hole and connecting its two
 * ends to Ruiny Twierdzy and Wymarłe Miasto with a line says the same thing —
 * this is a separate track, and those two fields are the only way onto it
 * (11.9) — while staying legible.
 */
const MOST_RECT: Rect = {
  x0: VIEW.width / 2 - 96,
  y0: DOLNY_RECT.y0 + DOLNY_BAND + 40,
  x1: VIEW.width / 2 + 96,
  y1: DOLNY_RECT.y1 - DOLNY_BAND - 40,
};

function placeRing(
  rect: Rect,
  band: number,
  sides: Sides,
  region: Cell["region"],
  names: ReadonlyMap<FieldId, string>,
): Cell[] {
  const cells: Cell[] = [];
  const add = (id: FieldId, x: number, y: number, w: number, h: number) =>
    cells.push({
      id,
      name: names.get(id) ?? id,
      region,
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
    });

  const width = rect.x1 - rect.x0;
  const innerHeight = rect.y1 - rect.y0 - band * 2;

  const topStep = width / sides.top.length;
  sides.top.forEach((id, i) => add(id, rect.x0 + topStep * i, rect.y0, topStep, band));

  const rightStep = innerHeight / sides.right.length;
  sides.right.forEach((id, i) =>
    add(id, rect.x1 - band, rect.y0 + band + rightStep * i, band, rightStep),
  );

  // Right to left: the bottom row is walked back towards the start of the lap.
  const bottomStep = width / sides.bottom.length;
  sides.bottom.forEach((id, i) =>
    add(id, rect.x1 - bottomStep * (i + 1), rect.y1 - band, bottomStep, band),
  );

  // Bottom to top, for the same reason.
  const leftStep = innerHeight / sides.left.length;
  sides.left.forEach((id, i) =>
    add(id, rect.x0, rect.y1 - band - leftStep * (i + 1), band, leftStep),
  );

  return cells;
}

function placeBridge(): Cell[] {
  const w = MOST_RECT.x1 - MOST_RECT.x0;
  const step = (MOST_RECT.y1 - MOST_RECT.y0) / KAMIENNY_MOST.length;
  return KAMIENNY_MOST.map((field, i) => {
    const y = MOST_RECT.y0 + step * i;
    return {
      id: field.id,
      name: field.name,
      region: "most" as const,
      x: MOST_RECT.x0,
      y,
      w,
      h: step,
      cx: MOST_RECT.x0 + w / 2,
      cy: y + step / 2,
    };
  });
}

const NAMES = new Map<FieldId, string>(
  [...GORNY_KRAG, ...SRODKOWY_KRAG, ...DOLNY_KRAG, ...KAMIENNY_MOST].map((f) => [
    f.id,
    f.name,
  ]),
);

export const CELLS: readonly Cell[] = [
  ...placeRing(GORNY_RECT, BAND, GORNY_SIDES, "gorny", NAMES),
  ...placeRing(SRODKOWY_RECT, BAND, SRODKOWY_SIDES, "srodkowy", NAMES),
  ...placeRing(DOLNY_RECT, DOLNY_BAND, DOLNY_SIDES, "dolny", NAMES),
  ...placeBridge(),
];

export const CELL_BY_ID: ReadonlyMap<FieldId, Cell> = new Map(
  CELLS.map((cell) => [cell.id, cell]),
);

/**
 * The two links that are not ring adjacency: on and off the Kamienny Most.
 *
 * Drawn as lines because nothing about the two tracks' geometry implies them —
 * they exist only because 11.9 says so.
 */
export const BRIDGE_LINKS: readonly { from: FieldId; to: FieldId }[] = [
  { from: "ruiny-twierdzy", to: "wejscie-na-most-a" },
  { from: "wymarle-miasto", to: "wejscie-na-most-b" },
];

/**
 * A colour per seat, in seat order.
 *
 * Chosen to stay apart from each other and from the board's own ochre — the
 * active field is ochre, so no player is — and to survive being drawn as a dot
 * eight pixels across on a phone.
 */
export const SEAT_COLOURS: readonly string[] = [
  "#e8553f",
  "#4fb3e8",
  "#63c08a",
  "#e0a3d8",
  "#f2d06b",
  "#a98bf0",
];

/**
 * Where to draw each player's dot, given who is standing where.
 *
 * Several characters share a field constantly — everyone starts scattered but
 * the rings are short and traffic converges on the Karczma and the Gród — so
 * dots are fanned across the cell rather than stacked. Up to three per row
 * keeps them inside even the narrowest cell.
 */
export function dotPositions(
  cell: Cell,
  count: number,
): { x: number; y: number }[] {
  const perRow = Math.min(3, Math.max(1, count));
  const rows = Math.ceil(count / perRow);
  const gapX = Math.min(26, (cell.w - 16) / perRow);
  const gapY = Math.min(24, (cell.h - 16) / Math.max(rows, 1));
  // Bottom-left, and the two halves of that are for different reasons. Bottom,
  // because the field's name is drawn from the top down and centring the
  // figures put them on the word. Left, because the card lying on a field is
  // drawn at the bottom *right* — so a busy field reads as "who is here" on one
  // side and "what is here" on the other, instead of the two overlapping.
  const left = cell.x + 6 + gapX / 2;
  const bottom = cell.y + cell.h - 8 - gapY / 2;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return {
      x: left + col * gapX,
      y: bottom - (rows - 1 - row) * gapY,
    };
  });
}

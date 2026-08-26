/** The board graph: which field neighbours which, and how movement runs around a ring. */

import type { Region } from "@/data/types";
import { GORNY_KRAG, GORNY_KRAG_FIELDS, SRODKOWY_KRAG, SRODKOWY_KRAG_FIELDS } from "./rings";

export { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";

/**
 * Every field on the board, as a type.
 *
 * Derived from the four ring definitions rather than written out beside them,
 * so there is exactly one list and it cannot drift from the board. What it buys
 * is that a field id is no longer a `string`: `"step"` is a compile error, and
 * `"step-2"` is not.
 *
 * That distinction is not academic. Six characters shipped for months starting
 * on a field called `"step"`, produced by slugifying the name printed on their
 * card. The board has two Steps, their ids are `step-1` and `step-2`, and
 * nothing anywhere could tell that the value was nonsense — it was a string,
 * and so was every real id. The figure went on the board at a place that did
 * not exist and the turn died there.
 *
 * The rule that follows: **anything that names a field names a `FieldId`.**
 * A string that has come from outside — a request body, a database column, a
 * name slugified off a card — is not one until `asFieldId` has looked at it.
 */
export type FieldId =
  | (typeof DOLNY_KRAG_FIELDS)[number]["id"]
  | (typeof KAMIENNY_MOST_FIELDS)[number]["id"]
  | (typeof SRODKOWY_KRAG_FIELDS)[number]["id"]
  | (typeof GORNY_KRAG_FIELDS)[number]["id"];

export interface BoardField {
  id: FieldId;
  name: string;
  region: Region;
  /** How many event cards stopping here makes you draw, if any. */
  draw?: number;
  /**
   * The instruction printed on the board for this field, verbatim.
   *
   * Shown to the player rather than interpreted. Most of these are die-roll
   * tables and shopping lists, and displaying the real text is both honest and
   * enough to be useful — the referee does not have to understand a field to
   * save someone hunting for it on the board under four other players' arms.
   */
  text?: string;
}

/**
 * Kraina Dolnego Kręgu — the innermost ring, fourteen fields around the centre.
 *
 * Verified twice over: this order was carried across from the 2020 prototype
 * and then checked field by field against the board scan, and every one of the
 * 27 characters' MGR starting fields lands inside it.
 *
 * Mokradła and Step each appear twice, on opposite sides of the ring, so their
 * ids are suffixed. The board prints the same name and the same instruction on
 * both, but they are different places and a character can stand on only one.
 *
 * Where the Kamienny Most crosses this ring the fields are Step and Mroźne
 * Pustkowie: walking the Dolny Krąg you ignore the bridge squares and use those
 * instead (rulebook p3).
 *
 * Stored CLOCKWISE, as printed. It used to be stored the other way round, which
 * left the cycle correct — every adjacency and every distance still came out
 * right — but inverted the one thing that depends on the sense: `destination`
 * treats a rising index as "zgodnie ze wskazówkami zegara", so the app told
 * players to walk the lower ring the wrong way. Harmless in simulation, wrong
 * on a table where a hand moves the figure. The scan settles it: the top edge
 * of this ring reads Osada, Step, Mokradła from left to right, which is the
 * order below.
 */
/**
 * The numerals run in ring order, not id order.
 *
 * `step-1` is the *second* Step you walk past and is labelled Step II. The ids
 * were assigned from where each field sits on the scanned board; the numeral is
 * for a player walking the ring, and it is the numeral they see. It also means
 * a character whose MGR reads "Step" starts on Step I, which is the one you
 * would point at if somebody asked.
 */
const DOLNY_KRAG_FIELDS = [
  { id: "karczma", name: "Karczma", region: "dolny" },
  { id: "uroczysko", name: "Uroczysko", region: "dolny", draw: 1 },
  { id: "step-2", name: "Step I", region: "dolny", draw: 1 },
  { id: "mokradla-2", name: "Mokradła I", region: "dolny", draw: 1 },
  { id: "kurhan", name: "Kurhan", region: "dolny" },
  { id: "osada", name: "Osada", region: "dolny" },
  { id: "step-1", name: "Step II", region: "dolny", draw: 1 },
  { id: "mokradla-1", name: "Mokradła II", region: "dolny", draw: 1 },
  { id: "czarci-mlyn", name: "Czarci Młyn", region: "dolny" },
  { id: "krag-mocy", name: "Krąg Mocy", region: "dolny" },
  { id: "studnia-wiecznosci", name: "Studnia Wieczności", region: "dolny" },
  { id: "bezdroza", name: "Bezdroża", region: "dolny", draw: 2 },
  { id: "grod", name: "Gród", region: "dolny" },
  { id: "mrozne-pustkowie", name: "Mroźne Pustkowie", region: "dolny", draw: 1 },
] as const;

export const DOLNY_KRAG: readonly BoardField[] = DOLNY_KRAG_FIELDS;


/**
 * Kamienny Most — nine fields in a straight line through the centre, with
 * Zamek Bestii in the middle and an entrance at each end.
 *
 * It is drawn across all three rings on the board but belongs to none of them:
 * the bridge stands high above the valley, so a character walking a ring skips
 * these squares entirely and only steps onto them from the Górny Krąg (p3,
 * 11.9). Movement here ignores the die — one field per turn (10.3).
 */
const KAMIENNY_MOST_FIELDS = [
  { id: "wejscie-na-most-a", name: "Wejście na Most I", region: "most" },
  { id: "pulapka", name: "Pułapka", region: "most" },
  { id: "gra-ze-smiercia", name: "Gra ze Śmiercią", region: "most" },
  { id: "demon-zaglady", name: "Demon Zagłady", region: "most" },
  { id: "zamek-bestii", name: "Zamek Bestii", region: "most" },
  { id: "monstrum", name: "Monstrum", region: "most" },
  { id: "cerber", name: "Cerber", region: "most" },
  { id: "magiczna-pulapka", name: "Magiczna Pułapka", region: "most" },
  { id: "wejscie-na-most-b", name: "Wejście na Most II", region: "most" },
] as const;

export const KAMIENNY_MOST: readonly BoardField[] = KAMIENNY_MOST_FIELDS;


/** Every field the engine knows about, by id. */
export const FIELDS: ReadonlyMap<FieldId, BoardField> = new Map(
  [...DOLNY_KRAG, ...SRODKOWY_KRAG, ...GORNY_KRAG, ...KAMIENNY_MOST].map((field) => [
    field.id,
    field,
  ]),
);

/**
 * The one door a `string` comes through to become a `FieldId`.
 *
 * Everything inside the engine names fields by literal, and the compiler checks
 * those. What it cannot check is a value that arrived from somewhere else — a
 * `field_id` column, a request body, a name slugified off a character card —
 * because at that moment it really is just a string. This is where that gets
 * decided, once, instead of being assumed at every use.
 *
 * Prefer `asFieldId` where there is something sensible to do with a bad value,
 * and `requireFieldId` where there is not: a seat standing on a field that does
 * not exist has no legal move and no dot on the map, and failing loudly beats
 * carrying the nonsense forward.
 */
export function isFieldId(value: string | null | undefined): value is FieldId {
  return value !== null && value !== undefined && FIELDS.has(value as FieldId);
}

export function asFieldId(value: string | null | undefined): FieldId | null {
  return isFieldId(value) ? value : null;
}

export function requireFieldId(value: string | null | undefined, what = "Obszar"): FieldId {
  if (!isFieldId(value)) throw new Error(`${what}: nie ma takiego Obszaru — ${value}`);
  return value;
}

/**
 * The numeral this project adds to tell two identical fields apart.
 *
 * Eight names on the printed board belong to two fields each — two Steps and
 * two Mokradła in the Dolny Krąg alone — and the board prints both of them the
 * same. That is fine on a table where you point at one, and useless in a list
 * of destinations that offers "Step" twice, so the app numbers them: Step I and
 * Step II. The numeral is ours, not the board's.
 */
const NUMERAL = /\s+(I{1,3})$/;

/** A field's name as the board prints it, without the numeral this app adds. */
export function printedName(name: string): string {
  return name.replace(NUMERAL, "");
}

/**
 * Finds a field by the name something outside the board calls it.
 *
 * Falls back to the printed name because the things that name fields — a
 * character's MGR above all — were written against the board, where both Steps
 * are just "Step". An exact match wins, so "Step I" finds the one it names and
 * "Step" finds the first of them.
 */
export function fieldByName(name: string): BoardField | undefined {
  const all = [...FIELDS.values()];
  return all.find((field) => field.name === name) ?? all.find((field) => printedName(field.name) === name);
}

export type Direction = "clockwise" | "widdershins";

/**
 * Where a character lands moving `steps` fields around a ring.
 *
 * Rule 10.2: movement is around one ring in either direction, chosen freely
 * each turn, and the direction cannot change part-way through a single move —
 * hence one direction for the whole walk rather than a per-step choice.
 */
export function destination(
  ring: readonly BoardField[],
  fromId: string,
  steps: number,
  direction: Direction,
): BoardField | null {
  const at = ring.findIndex((field) => field.id === fromId);
  if (at === -1) return null;
  const delta = direction === "clockwise" ? steps : -steps;
  const index = (((at + delta) % ring.length) + ring.length) % ring.length;
  return ring[index];
}

export interface MoveOption {
  direction: Direction;
  field: BoardField;
  /** The fields walked through on the way, excluding the start and the landing square. */
  through: BoardField[];
}

/**
 * Both landing squares available for a roll — one each way round.
 *
 * `through` is carried because the passage matters: a few instructions and
 * abilities care about what a character walked past, not just where it stopped.
 * With a roll of 7 on a 14-field ring the two directions can land on the same
 * field; that is a real property of the board, not a bug, and both options are
 * still returned so the player picks the route.
 */
export function moveOptions(
  ring: readonly BoardField[],
  fromId: string,
  steps: number,
): MoveOption[] {
  const directions: Direction[] = ["clockwise", "widdershins"];
  return directions.flatMap((direction) => {
    const field = destination(ring, fromId, steps, direction);
    if (!field) return [];
    const through: BoardField[] = [];
    for (let step = 1; step < steps; step++) {
      const passed = destination(ring, fromId, step, direction);
      if (passed) through.push(passed);
    }
    return [{ direction, field, through }];
  });
}

/**
 * The two ways onto the Kamienny Most, and what stands in each (11.9-11.11).
 *
 * Both entrance fields print the same shape of rule: a guardian whose strength
 * is rolled rather than fixed — "1 - 5; 2 - 6; 3 - 7; 4 - 8; 5 - 9; 6 - 10", so
 * a die plus four — measured against a different stat at each end, and costing a
 * point of that same stat to lose. The guardian stays put whether or not it is
 * beaten, and ignores anyone walking off the bridge.
 *
 * `entersAt` is the end of the bridge each opens onto and is not
 * interchangeable: KAMIENNY_MOST is written from the top of the board down,
 * Ruiny Twierdzy sits on the outer ring's top edge and Wymarłe Miasto on its
 * bottom edge.
 */
export interface BridgeEntrance {
  from: FieldId;
  guardian: string;
  entersAt: FieldId;
  /** The stat the guardian is fought with, and the one a loss costs (11.11). */
  stat: "sword" | "magic";
}

/** What a die roll makes the guardian worth: the board prints 1→5 through 6→10. */
export const GUARDIAN_STRENGTH_OFFSET = 4;

export const BRIDGE_ENTRANCES: readonly BridgeEntrance[] = [
  {
    from: "ruiny-twierdzy",
    guardian: "Kamienny Potwór",
    entersAt: "wejscie-na-most-a",
    stat: "sword",
  },
  {
    from: "wymarle-miasto",
    guardian: "Duch Skał",
    entersAt: "wejscie-na-most-b",
    stat: "magic",
  },
];

/**
 * The two river crossings in the middle ring.
 *
 * Both print the same instruction: "Musisz przeprawić się przez rzekę płacąc
 * przewoźnikowi 1 Sz. Z. lub wracasz na Obszar, z którego rozpocząłeś ruch." So
 * landing here is not a free stop — it is a toll, and the alternative is the
 * whole move being undone.
 */
export const FERRY_TOLL = 1;

export function isFerry(fieldId: FieldId): boolean {
  // The printed name, not the numbered one: both river crossings are a
  // Przeprawa and the numeral is this app's, so matching the full name would
  // have quietly stopped charging the ferryman at either of them.
  const field = FIELDS.get(fieldId);
  return field ? printedName(field.name) === "Przeprawa" : false;
}

export function bridgeEntranceFrom(fieldId: FieldId): BridgeEntrance | undefined {
  return BRIDGE_ENTRANCES.find((entrance) => entrance.from === fieldId);
}

/** The ring a field belongs to, for movement purposes. */
export function ringOf(fieldId: FieldId): readonly BoardField[] | null {
  if (DOLNY_KRAG.some((f) => f.id === fieldId)) return DOLNY_KRAG;
  if (SRODKOWY_KRAG.some((f) => f.id === fieldId)) return SRODKOWY_KRAG;
  if (GORNY_KRAG.some((f) => f.id === fieldId)) return GORNY_KRAG;
  if (KAMIENNY_MOST.some((f) => f.id === fieldId)) return KAMIENNY_MOST;
  return null;
}

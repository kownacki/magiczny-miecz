/** The board graph: which field neighbours which, and how movement runs around a ring. */

import type { Region } from "@/data/types";
import { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";

export { GORNY_KRAG, SRODKOWY_KRAG } from "./rings";

export interface BoardField {
  id: string;
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
export const DOLNY_KRAG: readonly BoardField[] = [
  { id: "karczma", name: "Karczma", region: "dolny" },
  { id: "uroczysko", name: "Uroczysko", region: "dolny", draw: 1 },
  { id: "step-2", name: "Step", region: "dolny", draw: 1 },
  { id: "mokradla-2", name: "Mokradła", region: "dolny", draw: 1 },
  { id: "kurhan", name: "Kurhan", region: "dolny" },
  { id: "osada", name: "Osada", region: "dolny" },
  { id: "step-1", name: "Step", region: "dolny", draw: 1 },
  { id: "mokradla-1", name: "Mokradła", region: "dolny", draw: 1 },
  { id: "czarci-mlyn", name: "Czarci Młyn", region: "dolny" },
  { id: "krag-mocy", name: "Krąg Mocy", region: "dolny" },
  { id: "studnia-wiecznosci", name: "Studnia Wieczności", region: "dolny" },
  { id: "bezdroza", name: "Bezdroża", region: "dolny", draw: 2 },
  { id: "grod", name: "Gród", region: "dolny" },
  { id: "mrozne-pustkowie", name: "Mroźne Pustkowie", region: "dolny", draw: 1 },
];

/**
 * Kamienny Most — nine fields in a straight line through the centre, with
 * Zamek Bestii in the middle and an entrance at each end.
 *
 * It is drawn across all three rings on the board but belongs to none of them:
 * the bridge stands high above the valley, so a character walking a ring skips
 * these squares entirely and only steps onto them from the Górny Krąg (p3,
 * 11.9). Movement here ignores the die — one field per turn (10.3).
 */
export const KAMIENNY_MOST: readonly BoardField[] = [
  { id: "wejscie-na-most-a", name: "Wejście na Most", region: "most" },
  { id: "pulapka", name: "Pułapka", region: "most" },
  { id: "gra-ze-smiercia", name: "Gra ze Śmiercią", region: "most" },
  { id: "demon-zaglady", name: "Demon Zagłady", region: "most" },
  { id: "zamek-bestii", name: "Zamek Bestii", region: "most" },
  { id: "monstrum", name: "Monstrum", region: "most" },
  { id: "cerber", name: "Cerber", region: "most" },
  { id: "magiczna-pulapka", name: "Magiczna Pułapka", region: "most" },
  { id: "wejscie-na-most-b", name: "Wejście na Most", region: "most" },
];

/** Every field the engine knows about, by id. */
export const FIELDS: ReadonlyMap<string, BoardField> = new Map(
  [...DOLNY_KRAG, ...SRODKOWY_KRAG, ...GORNY_KRAG, ...KAMIENNY_MOST].map((field) => [
    field.id,
    field,
  ]),
);

export function fieldByName(name: string): BoardField | undefined {
  return [...FIELDS.values()].find((field) => field.name === name);
}

export type Direction = "zgodnie" | "przeciwnie";

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
  const delta = direction === "zgodnie" ? steps : -steps;
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
  const directions: Direction[] = ["zgodnie", "przeciwnie"];
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

/** The ring a field belongs to, for movement purposes. */
export function ringOf(fieldId: string): readonly BoardField[] | null {
  if (DOLNY_KRAG.some((f) => f.id === fieldId)) return DOLNY_KRAG;
  if (SRODKOWY_KRAG.some((f) => f.id === fieldId)) return SRODKOWY_KRAG;
  if (GORNY_KRAG.some((f) => f.id === fieldId)) return GORNY_KRAG;
  if (KAMIENNY_MOST.some((f) => f.id === fieldId)) return KAMIENNY_MOST;
  return null;
}

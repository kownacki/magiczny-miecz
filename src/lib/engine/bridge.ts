/** The Kamienny Most: the seven fields between an entrance and the Zamek Bestii, and what each of them does (14.5–14.7). */

import type { RandomPort } from "./ports";
import type { FieldId } from "./board";

/**
 * Which approach a character is walking.
 *
 * The bridge is symmetrical and its two halves mirror each other: everything on
 * the Ruiny Twierdzy side tests Miecz, everything on the Wymarłe Miasto side
 * tests Magia (14.5). Which one you are on is decided by the entrance you came
 * through and never changes mid-bridge, because the Zamek is in the middle and
 * you turn back the way you came.
 */
export type BridgeSide = "sword" | "magic";

/** Which side of the bridge a field belongs to. */
export const BRIDGE_SIDE: Partial<Record<FieldId, BridgeSide>> = {
  "wejscie-na-most-a": "sword",
  pulapka: "sword",
  "gra-ze-smiercia": "sword",
  "demon-zaglady": "sword",
  monstrum: "magic",
  cerber: "magic",
  "magiczna-pulapka": "magic",
  "wejscie-na-most-b": "magic",
};

/**
 * Where three dice less your stat put you down (14.5, and the field text, which
 * is the more specific of the two).
 *
 * The printed tables:
 *
 *   PUŁAPKA (Miecz)          0 tu · 1 wejście · 2-3 Ruiny · 4-5 Twierdza · 6+ Osada
 *   MAGICZNA PUŁAPKA (Magia) 0 tu ·   —       · 2-3 Miasto · 4-5 Nemed   · 6+ Karczma
 *
 * The Magiczna Pułapka table has no row for 1: it jumps from 0 straight to
 * "2, 3", and the transcription notes this is printed that way rather than a
 * slip in copying. Its mirror gives that result the bridge entrance, and
 * nothing else in the box gives a reason to treat the two traps differently, so
 * a 1 lands on the entrance here too. It is a house reading of a misprint and
 * it is the only invented number in this file.
 */
const TRAP_TABLE: Record<BridgeSide, { upTo: number; fieldId: FieldId }[]> = {
  sword: [
    { upTo: 1, fieldId: "wejscie-na-most-a" },
    { upTo: 3, fieldId: "ruiny-twierdzy" },
    { upTo: 5, fieldId: "twierdza-strzegaca-drog" },
    { upTo: Infinity, fieldId: "osada" },
  ],
  magic: [
    { upTo: 1, fieldId: "wejscie-na-most-b" },
    { upTo: 3, fieldId: "wymarle-miasto" },
    { upTo: 5, fieldId: "swiatynia-bogini-nemed" },
    { upTo: Infinity, fieldId: "karczma" },
  ],
};

export type TrapOutcome =
  | { fell: false; result: number }
  | { fell: true; result: number; fieldId: FieldId };

/**
 * Rule 14.5. Three dice, less Miecz or Magia depending on the side.
 *
 * A result of zero is the trap missed and the character stays where it is.
 * Negative results are zero as well — a character whose Miecz exceeds three
 * dice has simply walked through, and the table has no row below nothing.
 */
export function trapOutcome(dice: readonly number[], stat: number, side: BridgeSide): TrapOutcome {
  const result = Math.max(0, dice.reduce((sum, die) => sum + die, 0) - stat);
  if (result === 0) return { fell: false, result };
  const row = TRAP_TABLE[side].find((entry) => result <= entry.upTo);
  return { fell: true, result, fieldId: row!.fieldId };
}

/**
 * Rule 14.5's second half: one die for every Przedmiot and every Przyjaciel,
 * and only a 1 or a 2 keeps it.
 *
 * A fall from the bridge is the most expensive thing in the game — two thirds
 * of everything a character owns, on average — which is why the traps are worth
 * getting right rather than waving through.
 */
export function keptAfterFall<T>(
  carried: readonly T[],
  rolls: readonly number[],
): { kept: T[]; lost: T[] } {
  const kept: T[] = [];
  const lost: T[] = [];
  carried.forEach((card, index) => {
    const die = rolls[index];
    if (die === 1 || die === 2) kept.push(card);
    else lost.push(card);
  });
  return { kept, lost };
}

export type DeathGameOutcome = "dalej" | "znowu" | "strata";

/**
 * GRA ZE ŚMIERCIĄ: two dice each, against Death's two.
 *
 * Higher and you walk on; equal and you are simply still here next turn; lower
 * and it costs a point of Życie and you play it again. Note that a draw is not
 * a loss — the same distinction 17.10 makes about combat, and the same one that
 * is easy to get backwards.
 */
export function deathGameOutcome(
  mine: readonly number[],
  deaths: readonly number[],
): DeathGameOutcome {
  const sum = (dice: readonly number[]) => dice.reduce((total, die) => total + die, 0);
  const me = sum(mine);
  const death = sum(deaths);
  if (me > death) return "dalej";
  if (me === death) return "znowu";
  return "strata";
}

/**
 * CERBER: one die, and the dog takes between one and three points of Życie.
 *
 * There is no fight and nothing to decide — it is a toll paid in blood.
 */
export function cerberLoss(die: number): number {
  return Math.ceil(die / 2);
}

/**
 * DEMON ZAGŁADY / MONSTRUM: two dice give the creature its strength (Magia for
 * the Demon, Miecz for the Monstrum), and the character cannot pass until it is
 * dead. Losing costs a point of Życie and the fight resumes next turn.
 *
 * Rule 14.6 says "rzuca kostką" — one die — while the field text on the board
 * says "Rzuć 2 kostkami". The field text wins: it is the more specific of the
 * two and it is what is printed where a player is standing when the question
 * comes up. Two dice also give the range the creature needs to be a real
 * obstacle at that point in the game.
 */
export function guardianStrength(dice: readonly number[]): number {
  return dice.reduce((sum, die) => sum + die, 0);
}

/** Which of the two the field is, and so which stat the fight is fought with. */
export const BRIDGE_GUARDIAN: Partial<
  Record<FieldId, { kind: "magical" | "ordinary"; name: string }>
> = {
  "demon-zaglady": { kind: "magical", name: "Demon Zagłady" },
  monstrum: { kind: "ordinary", name: "Monstrum" },
};

/** The bridge fields that stop a character until something is settled. */
export const BRIDGE_ORDEAL: ReadonlySet<FieldId> = new Set<FieldId>([
  "pulapka",
  "gra-ze-smiercia",
  "demon-zaglady",
  "monstrum",
  "cerber",
  "magiczna-pulapka",
]);

/** Rolls a number of dice through the port, so the caller need not care which. */
export async function rollDice(
  random: RandomPort,
  count: number,
  reason: string,
): Promise<number[]> {
  const dice: number[] = [];
  for (let i = 0; i < count; i++) dice.push(await random.rollD6(reason));
  return dice;
}

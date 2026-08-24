/** Resolves ordinary and magical combat: the pure comparison in rules 17.4-17.10 and 18.2, plus the roll-gathering around it. */

import type { RandomPort } from "./ports";

export type CombatKind = "zwykla" | "magiczna";

export interface CombatSide {
  label: string;
  /** Całkowity Miecz for ordinary combat, Całkowita Magia for magical (18.2a). */
  total: number;
  roll: number;
}

export type CombatResult =
  | { outcome: "wygrana"; winner: string; loser: string; kind: CombatKind }
  | { outcome: "przegrana"; winner: string; loser: string; kind: CombatKind }
  | { outcome: "remis"; kind: CombatKind };

/**
 * Rule 17.4: each side adds one die to its total and the larger sum wins.
 * Rule 17.10: equal sums are a draw and *neither* side loses anything — a draw
 * is not a loss for the defender, which is the detail tables most often get
 * wrong.
 *
 * Pure on purpose: given the two totals and the two rolls there is nothing left
 * to decide, so this needs no ports and can be exhaustively tested.
 */
export function compareCombat(
  attacker: CombatSide,
  defender: CombatSide,
  kind: CombatKind,
): CombatResult {
  const attack = attacker.total + attacker.roll;
  const defence = defender.total + defender.roll;
  if (attack === defence) return { outcome: "remis", kind };
  return attack > defence
    ? { outcome: "wygrana", winner: attacker.label, loser: defender.label, kind }
    : { outcome: "przegrana", winner: defender.label, loser: attacker.label, kind };
}

/**
 * Rule 17.5: several creatures attacking at once are one opponent — their Miecz
 * values are summed and a single die is added to the sum, rather than each
 * fighting its own round.
 */
export function combinedEnemyTotal(enemies: readonly { total: number }[]): number {
  return enemies.reduce((sum, enemy) => sum + enemy.total, 0);
}

/**
 * What the winner may take, per rule 17.9: one point of Życie, or one item
 * (a magical one included), or one Sztuka Złota. The choice belongs to the
 * winner, so this only enumerates it.
 *
 * In magical combat the life loss cannot be prevented by any item (18.2b),
 * which is why `preventable` is reported alongside.
 */
export interface Spoils {
  options: readonly ["zycie", "przedmiot", "zloto"];
  preventable: boolean;
}

export function spoilsFor(kind: CombatKind): Spoils {
  return {
    options: ["zycie", "przedmiot", "zloto"] as const,
    // 17.9 lets an item or spell prevent the point of Życie in ordinary combat;
    // 18.2b removes that possibility entirely in magical combat.
    preventable: kind === "zwykla",
  };
}

export interface CombatRequest {
  attacker: Omit<CombatSide, "roll">;
  defender: Omit<CombatSide, "roll">;
  kind: CombatKind;
}

/**
 * Gathers both rolls through the port and compares them.
 *
 * The attacker's roll is taken first because rule 17.8 fixes that order, and at
 * a physical table the order is what people actually follow. Spells must
 * already have been declared before this is called (17.3, 17.7) — this function
 * deliberately has no way to cast one, so a caller that skips the reaction
 * window cannot silently smuggle one in afterwards.
 */
export async function resolveCombat(
  request: CombatRequest,
  random: RandomPort,
): Promise<{ result: CombatResult; attackerRoll: number; defenderRoll: number }> {
  const attackerRoll = await random.rollD6(`walka: ${request.attacker.label}`);
  const defenderRoll = await random.rollD6(`walka: ${request.defender.label}`);
  const result = compareCombat(
    { ...request.attacker, roll: attackerRoll },
    { ...request.defender, roll: defenderRoll },
    request.kind,
  );
  return { result, attackerRoll, defenderRoll };
}

/**
 * Rule 14.7: the Beast's strength is rolled for, not fixed — 1 gives 10 and
 * each further pip adds one, up to 15. The same table serves Miecz and Magia
 * because a separate roll (1-3 / 4-6) decides which kind of fight it is.
 */
export function beastStrength(roll: number): number {
  return 9 + roll;
}

export function beastCombatKind(roll: number): CombatKind {
  return roll <= 3 ? "zwykla" : "magiczna";
}

/** Resolves ordinary and magical combat: the pure comparison in rules 17.4-17.10 and 18.2. */

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
 * Several creatures as one opponent, or not at all (17.5).
 *
 * "Miecze tych istot są sumowane, a do uzyskanego rezultatu dodawany jest wynik
 * rzutu kostką" — one roll for the lot of them, which is the difference between
 * hard and hopeless. Only when they fight the same way: an ordinary Wróg and a
 * magical one are two fights, because 17.4 and 18.2 read different numbers off
 * the character.
 *
 * Null is "these do not attack together", which is the same answer the server
 * refuses a mixed fight with and the interface hides the button on. It was two
 * readings agreeing by luck — the interface also added the Miecze up with its
 * own `reduce` beside this function rather than through it.
 */
export function attackAsOne(
  enemies: readonly { kind: CombatKind; total: number }[],
): { kind: CombatKind; total: number } | null {
  if (enemies.length === 0) return null;
  const kinds = new Set(enemies.map((enemy) => enemy.kind));
  if (kinds.size > 1) return null;
  return { kind: enemies[0].kind, total: combinedEnemyTotal(enemies) };
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
  options: readonly ["zycie", "item", "zloto"];
  preventable: boolean;
}

export function spoilsFor(kind: CombatKind): Spoils {
  return {
    options: ["zycie", "item", "zloto"] as const,
    // 17.9 lets an item or spell prevent the point of Życie in ordinary combat;
    // 18.2b removes that possibility entirely in magical combat.
    preventable: kind === "zwykla",
  };
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

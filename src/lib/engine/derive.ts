/** Computes the values the rulebook defines as derived rather than tracked: total Miecz and Magia, spell capacity, carrying limits. */

import type { Item, Nature } from "@/data/types";
import type { Holding, Seat } from "./state";
import type { EqMode } from "./slots";
import {
  carryLimit as abilityCarryLimit,
  heldAbilities,
  spellsOverLimit,
} from "./abilities";

/**
 * Rule 2.6, read straight off the printed table:
 *
 *     Całkowita Magia Postaci:  1 2 3 4 5 6 i więcej
 *     Maksymalna liczba Zaklęć: 0 1 2 2 3 3       3
 *
 * Three is the ceiling however high Magia climbs. Magia 0 appears nowhere on
 * the table but is reachable in play, and carries no spells.
 *
 * NOTE: the worked example beneath the table is hard to reconcile with it — the
 * scan reads "z 5 do 5 punktów ... tylko 2 Zaklęć", which is garbled either way.
 * The table is unambiguous and is what is encoded here; the example is flagged
 * in docs/TASKS.md for a second look at the physical card.
 */
const SPELL_CAPACITY = [0, 0, 1, 2, 2, 3, 3] as const;

export function spellCapacity(totalMagia: number): number {
  if (totalMagia <= 0) return 0;
  return SPELL_CAPACITY[Math.min(totalMagia, SPELL_CAPACITY.length - 1)];
}

export interface Bonuses {
  miecz: number;
  magia: number;
}

/**
 * What a seat's held cards add on top of its own points.
 *
 * Rules 1.5 and 2.5 make the total the sum of own points plus contributions
 * from Items, Magic Items and Friends. Two things this deliberately does not
 * do: it never writes back to the seat (the total is recomputed on every read,
 * so it cannot drift from the cards actually held), and it never lets a bonus
 * make a *trophy* count — defeated-enemy cards are held to be traded for Miecz
 * later (1.4), not to be worn.
 */
export function bonusesFrom(
  holdings: readonly Holding[],
  items: ReadonlyMap<string, Item>,
  { suppressMagicalItems = false }: { suppressMagicalItems?: boolean } = {},
): Bonuses {
  let miecz = 0;
  let magia = 0;
  for (const holding of holdings) {
    if (holding.kind === "trophy") continue;
    const item = items.get(holding.cardId);
    if (!item) continue;
    // Zaczarowane Wzgórza suspends points gained from Magic Items while a
    // character stands there (the worked example under 2.6). Ordinary items
    // keep working.
    if (suppressMagicalItems && item.magical) continue;
    miecz += item.miecz ?? 0;
    magia += item.magia ?? 0;
  }
  return { miecz, magia };
}

export interface Totals {
  miecz: number;
  magia: number;
  spellCapacity: number;
}

export function totalsFor(
  seat: Seat,
  items: ReadonlyMap<string, Item>,
  options?: { suppressMagicalItems?: boolean },
): Totals {
  const bonus = bonusesFrom(seat.holdings, items, options);
  const magia = seat.magiaOwn + bonus.magia;
  // The Różdżka Zaklęć raises 2.6's limit the way the Koń raises 5.4's, so the
  // capacity is asked for rather than read straight off the table.
  const extraSpells = spellsOverLimit(
    heldAbilities(seat.holdings.filter((h) => h.kind !== "trophy").map((h) => h.cardId)),
  );
  return {
    miecz: seat.mieczOwn + bonus.miecz,
    magia,
    spellCapacity: spellCapacity(magia) + extraSpells,
  };
}

/**
 * Applies a change to a seat's own Miecz or Magia, honouring the floor from
 * rules 1.3 and 2.3: own points can be lost, but never below the value the
 * character started the game with.
 */
export function adjustOwn(seat: Seat, stat: "miecz" | "magia", delta: number): Seat {
  const ownKey = stat === "miecz" ? "mieczOwn" : "magiaOwn";
  const floorKey = stat === "miecz" ? "mieczFloor" : "magiaFloor";
  return { ...seat, [ownKey]: Math.max(seat[floorKey], seat[ownKey] + delta) };
}

/**
 * Rule 4.7: healing only restores life a character started with — four points
 * (4.2). Life gained from encounters and exploration is not capped (4.6), so
 * this ceiling applies to healing alone, never to a gain.
 */
export const HEAL_CEILING = 4;

/**
 * The outer `Math.max` is not redundant. Życie can legitimately sit above four,
 * because gains from encounters and exploration are uncapped (4.6) while only
 * *healing* is limited to the starting level (4.7). Clamping with `min` alone
 * would let a heal on a character at six quietly drain them to four — healing
 * must never be able to take life away.
 */
export function heal(seat: Seat, amount: number): Seat {
  return {
    ...seat,
    zycie: Math.max(seat.zycie, Math.min(HEAL_CEILING, seat.zycie + amount)),
  };
}

export function gainLife(seat: Seat, amount: number): Seat {
  return { ...seat, zycie: seat.zycie + amount };
}

/**
 * Rule 5.4: four items at a time, unless the character has a means of transport
 * — a Horse, Mule, Team or Bearer. Gold is not an item and never counts (3.5).
 */
export const BASE_CARRY_LIMIT = 4;

/**
 * What a character can actually carry.
 *
 * Rule 5.4 says "unless the character has a means of transport", and this used
 * to read that as *unlimited* for any of them. The cards are more careful: the
 * Koń carries eight, the Muł and the Tragarz four apiece, the Magiczna Sakwa
 * five over your own capacity, and only the Zaprzęg says "dowolną liczbę". So
 * the number comes from the card now, through the shared ability vocabulary.
 *
 * Trophies are excluded because a trophy is a beaten enemy's card kept for
 * trading (1.4), not a thing being carried — a Koń won as a trophy pulls no
 * cart.
 */
export function carryLimit(
  holdings: readonly Holding[],
  eqMode: EqMode = "klasyczny",
): number {
  // In the slotted variant a Koń pulls nothing while it is in the pack: the
  // whole point of the variant is that a thing works where it is worn, and the
  // mount place is where a mount is worn.
  const counts = (held: Holding) =>
    held.kind !== "trophy" && (eqMode === "klasyczny" || held.slot != null);
  const carried = holdings.filter(counts).map((h) => h.cardId);
  return abilityCarryLimit(heldAbilities(carried), BASE_CARRY_LIMIT);
}

/**
 * How many Przedmioty count against the limit of 5.4.
 *
 * In klasyczny play that is all of them, because the rulebook knows only one
 * kind of possession. In slotowy what a character is wearing hangs on the
 * character rather than being carried, so the limit applies to the pack alone.
 */
export function carriedCount(
  holdings: readonly Holding[],
  eqMode: EqMode = "klasyczny",
): number {
  return holdings.filter(
    (held) => held.kind === "item" && (eqMode === "klasyczny" || held.slot == null),
  ).length;
}

/**
 * Rule 5.3: a character may not hold an item its Nature forbids. Finding one
 * does not destroy it — the card is left face up on the field where it was
 * found, which is why this answers only the permission question.
 */
export function mayHold(item: Item, nature: Nature | null): boolean {
  if (!item.forbiddenTo || nature === null) return true;
  return !item.forbiddenTo.includes(nature);
}

/**
 * Rule 9.4 in the direction that bites: a character holding more spells than
 * its Magia allows must discard the excess immediately. Returns how many must
 * go, so the caller can ask which.
 */
export function excessSpells(seat: Seat, totals: Totals): number {
  const held = seat.holdings.filter((h) => h.kind === "spell").length;
  return Math.max(0, held - totals.spellCapacity);
}

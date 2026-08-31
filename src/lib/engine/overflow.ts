/** Carrying more than you may, and every way back under (5.4, 5.6, 2.6, 9.4). */

import type { Holding } from "./state";
import type { Nature } from "@/data/types";
import { carriedCount, carryLimit, spellAllowance } from "./derive";
import type { Ability } from "./abilities";
import { slotOnArrival } from "./holdings";
import { isUsable } from "./uses";
import { RELICS, type EqMode, type Slot } from "./slots";

/**
 * How far over a seat is, or null when it is not.
 *
 * Two limits and they are different in kind. The pack's is a fact about the
 * cards themselves — `carryLimit` reads what is held, not what it lends, so the
 * Zaczarowane Wzgórza suspend a Koń's points and never its carrying. The
 * hand's is positional, and 2.6's own worked example is the proof: walking onto
 * those same Wzgórza costs a Mag his Pierścień's Magia and with it a Zaklęcie.
 */
export interface Overflow {
  /** "przedmioty" for 5.6's four, "zaklecia" for 2.6's table. */
  what: "przedmioty" | "zaklecia";
  held: number;
  limit: number;
  /** How many have to go. Always at least one. */
  over: number;
}

export function overflowIn(
  holdings: readonly Holding[],
  eqMode: EqMode,
  /** The seat's total Magia and its setup hand, for 2.6's table and the Różdżka. */
  spells: { magia: number; atSetup: number; abilities: readonly Ability[] },
): Overflow | null {
  const carried = carriedCount(holdings, eqMode);
  const limit = carryLimit(holdings, eqMode);
  if (carried > limit) {
    return { what: "przedmioty", held: carried, limit, over: carried - limit };
  }

  const held = holdings.filter((one) => one.kind === "spell").length;
  const allowed = spellAllowance(spells.magia, spells.atSetup, spells.abilities);
  if (held > allowed) {
    return { what: "zaklecia", held, limit: allowed, over: held - allowed };
  }
  return null;
}

/**
 * One thing a player could do, right now, to be carrying one fewer.
 *
 * 5.6 hands the choice to the player and says nothing about *how* — "musi
 * natychmiast odrzucić Przedmioty, których nie jest w stanie unieść" is about
 * the outcome, not the method — so anything that ends with one fewer card in
 * the pack satisfies it. Putting one down is only the obvious one.
 */
export interface WayUnder {
  kind: "odrzuc" | "uzyj" | "zaloz";
  holdingId: string;
  cardId: string;
  /** Where the card ends up, in the language the rest of the app uses. */
  gdzie: "obszar" | "stos" | "na-sobie";
}

/**
 * Every way this seat could come back under its limit, listed rather than
 * assumed.
 *
 * Three kinds, and the second and third are the reason this is a list and not
 * a "drop something" button:
 *
 * - **odrzuć** — 5.5's own answer, and always available. The Karta goes face up
 *   on the Obszar you are standing on and 12.1 lets somebody else have it.
 * - **użyj** — a Przedmiot that is spent by using it is one you no longer
 *   carry. Eight cards in the box can be, and drinking the Eliksir Siły to make
 *   room is a perfectly good answer to being overloaded — better than most,
 *   since you keep what it bought.
 * - **załóż** — slotowy only. What is worn is not in the Plecak, so wearing a
 *   Hełm you were carrying frees a place without the card leaving you at all.
 *   In klasyczny there is nowhere to wear anything and 5.4 counts everything,
 *   so this is empty by construction rather than by omission.
 *
 * A Zaklęcie can only be dropped: 9.4 forbids shedding one at all *unless* the
 * hand is over 2.6's limit, and nothing in the box spends a Zaklęcie to make
 * room for another.
 */
export function waysUnder<T extends Holding & { id: string }>(
  holdings: readonly T[],
  eqMode: EqMode,
  nature: Nature | null,
  what: Overflow["what"],
  /**
   * Whether this Karta may be spent *right now*.
   *
   * A predicate rather than a rule, because when a Przedmiot may be used is a
   * question the cards answer one at a time and two of them do not answer at
   * all — see `uses.ts`. The caller knows what moment the turn is in; this
   * function only knows what would help.
   */
  canUse: (cardId: string) => boolean = isUsable,
): WayUnder[] {
  if (what === "zaklecia") {
    return holdings
      .filter((held) => held.kind === "spell")
      .map((held) => ({
        kind: "odrzuc" as const,
        holdingId: held.id,
        cardId: held.cardId,
        gdzie: "stos" as const,
      }));
  }

  const worn = holdings.map((held) => held.slot as Slot | null);
  const ways: WayUnder[] = [];
  for (const held of holdings) {
    // Only what actually presses against the limit is worth offering: a
    // Przyjaciel, a trofeum and the two relics are not in the count, so
    // shedding one would cost something and free nothing.
    if (held.kind !== "item") continue;
    if (RELICS.has(held.cardId)) continue;
    if (eqMode === "slots" && held.slot != null) continue;

    ways.push({ kind: "odrzuc", holdingId: held.id, cardId: held.cardId, gdzie: "obszar" });
    if (canUse(held.cardId)) {
      ways.push({ kind: "uzyj", holdingId: held.id, cardId: held.cardId, gdzie: "stos" });
    }
    const fits = slotOnArrival({ cardId: held.cardId, kind: "item", eqMode, nature, worn });
    if (fits !== null) {
      ways.push({ kind: "zaloz", holdingId: held.id, cardId: held.cardId, gdzie: "na-sobie" });
    }
  }
  return ways;
}

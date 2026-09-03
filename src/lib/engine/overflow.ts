/** Carrying more than you may, and every way back under (5.4, 5.6, 2.6, 9.4). */

import type { Holding } from "./state";
import type { Nature } from "@/data/types";
import { carriedCount, carryLimit, spellAllowance } from "./derive";
import type { Ability } from "./abilities";
import { slotOnArrival } from "./holdings";
import { isUsable } from "./uses";
import { RELICS, type EqMode, type Slot } from "./slots";
import { pop, push, top, type TurnState } from "./stack";
import type { TurnPhase } from "./turn";
import { plural } from "./polish";

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
  /**
   * The seat's total Magia and its setup hand, for 2.6's table and the Różdżka
   * — or the cap itself, already worked out.
   *
   * `allowed` exists because this was the *second* place computing 2.6, and two
   * bases that usually agree is the bug the envelope's own note warns about.
   * `seatView.spellCapacity` is the one the refusal, the greying and the tally
   * all rest on, and the console can take it off entirely
   * (`bez-limitu-zaklec`) — which this end could not see, so a seat with the
   * cap lifted went on opening overflow frames against a cap it no longer had.
   */
  spells: {
    magia: number;
    atSetup: number;
    abilities: readonly Ability[];
    allowed?: number;
  },
): Overflow | null {
  const carried = carriedCount(holdings, eqMode);
  const limit = carryLimit(holdings, eqMode);
  if (carried > limit) {
    return { what: "przedmioty", held: carried, limit, over: carried - limit };
  }

  const held = holdings.filter((one) => one.kind === "spell").length;
  const allowed =
    spells.allowed ?? spellAllowance(spells.magia, spells.atSetup, spells.abilities);
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

/* --------------------------------------------------------------------------
 * The frame: 5.6's "natychmiast", on the stack.
 *
 * `overflowIn` says whether a seat is over and `waysUnder` says what could be
 * done about it. What was missing between them is *when*: both rules say the
 * surplus goes immediately, and the app enforced that by refusing the next
 * thing the overloaded player tried to do — which is a different rule, and one
 * nobody else at the table can see being broken.
 *
 * So the surplus opens a frame, exactly as a fight or a question does, and the
 * table waits on it. See docs/STACK.md.
 * ----------------------------------------------------------------------- */

export type OverflowFrame = Extract<TurnPhase, { phase: "overflow" }>;

/** The surplus goes on top of whatever is running; everything beneath waits. */
export function openOverflow(state: TurnState, frame: OverflowFrame): TurnState {
  return push(state, frame);
}

/** Under the limit again: the frame comes off and what was running resumes. */
export function closeOverflow(state: TurnState): TurnState {
  return pop(state);
}

/**
 * The frame on top, or null.
 *
 * Only the top, because that is what "the table waits" means: a surplus that
 * had something pushed above it would be a surplus play had carried on past.
 * Nothing pushes above one — the guard below is what makes that true.
 */
export function overflowOnTop(state: TurnState): OverflowFrame | null {
  const frame = top(state);
  return frame.phase === "overflow" ? frame : null;
}

/**
 * What the table is waiting for, said the way both rules word it.
 *
 * The number is how many have to go, not how many are held: 5.6 and 2.6 are
 * both about the surplus, and "odrzuć 2" is the sentence a player can act on
 * where "masz 6 przy limicie 4" is one they have to do arithmetic on. Both are
 * here, because the second is what makes the first checkable.
 *
 * `who` is null for the person it is happening to, which is the only reason
 * this takes a name at all rather than being two functions. The console always
 * names a seat because it is read over somebody's shoulder; the turn box is
 * read by the player who has to act, and „Ania: 29 Zaklęć" to Ania is the app
 * talking about her in the third person while she is looking at it.
 */
export function overflowSaid(over: Overflow, who: string | null): string {
  const noun =
    over.what === "przedmioty"
      ? `${over.held} ${plural(over.held, "Przedmiot", "Przedmioty", "Przedmiotów")}`
      : `${over.held} ${plural(over.held, "Zaklęcie", "Zaklęcia", "Zaklęć")}`;
  const rule = over.what === "przedmioty" ? "5.6" : "2.6";
  return (
    `${who === null ? `Masz ${noun}` : `${who}: ${noun}`} przy limicie ${over.limit}` +
    ` — ${over.over} ${plural(over.over, "musi", "muszą", "musi")} zniknąć, zanim gra ruszy dalej (${rule}).`
  );
}

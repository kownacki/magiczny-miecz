/** Which action windows a turn is offering, and which of them are not offers at all. */

import type { FieldId } from "./board";

/**
 * Why this is a list and not a panel.
 *
 * Everything a turn can do used to be drawn at once, stacked down one box: the
 * field's prose, its die table, its shops, the crossing, the bridge ordeal, the
 * phase controls. Most of it is reference — what this Obszar *is* — and reading
 * it is not the same act as doing something about it. So the turn offers a
 * short list of windows instead, and the box that lists them stays the same
 * size whatever is in it.
 *
 * The decision of what is on that list is here, pure, because it is a reading
 * of the rules and not a question about React: 16.4 will not let a Wróg be
 * walked past, a Karczma happens to you on arrival, and 11.4 makes retrying a
 * crossing the point of the next turn.
 */
export type WindowId = "walka" | "karty" | "obszar" | "przeprawa" | "most";

export interface TurnWindow {
  id: WindowId;
  label: string;
  /** How many things are waiting behind it, where a number is worth showing. */
  count?: number;
  /**
   * The rules do not let this one be ignored.
   *
   * A button is an offer, and some of these are not offers — a Wróg attacks the
   * character who drew him (16.2) and the Karczma happens on arrival. The box
   * opens a compulsory window rather than waiting to be asked, which is what
   * the draw modal already does for a fight.
   */
  compulsory?: boolean;
}

/**
 * What the turn knows about itself, as plain data.
 *
 * Deliberately not the turn state itself: this is a reading of a situation, and
 * taking the situation apart into named facts is what lets the reading be
 * tested against the rules rather than against a store.
 */
export interface TurnFacts {
  /** Where the turn is: "rzut" before the move, "pole" on arrival, and so on. */
  phase: string;
  /** The Obszar the character is standing on, or null before they are placed. */
  standingOn: FieldId | null;
  /** Cards drawn here or lying here (16.8) and not yet dealt with. */
  cardsWaiting: number;
  /** A fight is running. */
  fighting: boolean;
  /** This Obszar is one of the four that cross between Kręgi (11.1, 11.5). */
  crossing: boolean;
  /** This Obszar is one of the Kamienny Most's own (14.5-14.6). */
  ordeal: boolean;
  /** This Obszar does something to whoever arrives, asked for or not. */
  demands: boolean;
}

/**
 * The windows this turn offers, most pressing first.
 *
 * Order is the whole of the ranking a player needs: 16.4 is explicit that
 * Spotkania and Wrogowie come before anything else on the Obszar, and a fight
 * already under way comes before even that.
 */
export function windowsFor(facts: TurnFacts): TurnWindow[] {
  const windows: TurnWindow[] = [];

  // A fight is not something you go back to later.
  if (facts.fighting) {
    windows.push({ id: "walka", label: "Walka", compulsory: true });
  }

  // 16.4: everything drawn here is settled before the Obszar itself is.
  if (facts.cardsWaiting > 0) {
    windows.push({
      id: "karty",
      label: "Karty",
      count: facts.cardsWaiting,
      compulsory: true,
    });
  }

  if (facts.standingOn) {
    windows.push({
      id: "obszar",
      label: "Obszar",
      ...(facts.demands ? { compulsory: true } : {}),
    });
  }

  // 11.4 makes retrying the point of the next turn — "czy będzie ponownie
  // próbowała przekroczyć granicę Kręgów" — so these are offered before the
  // roll as well as on arrival. Offering them only on arrival meant a failed
  // crossing could never be attempted again.
  const canTryAgain = facts.phase === "pole" || facts.phase === "rzut";
  if (facts.crossing && canTryAgain) {
    windows.push({ id: "przeprawa", label: "Przeprawa" });
  }
  if (facts.ordeal && canTryAgain) {
    windows.push({ id: "most", label: "Most" });
  }

  return windows;
}

/** The one the box should open by itself, if any. */
export function opensItself(windows: readonly TurnWindow[]): WindowId | null {
  return windows.find((window) => window.compulsory)?.id ?? null;
}

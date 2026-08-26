/** Which action windows a turn is offering, and which of them are not offers at all. */

import type { FieldId } from "./board";
import type { TurnPhase } from "./turn";
import { BRIDGE_ORDEAL } from "./bridge";
import { crossingFrom } from "./rings";
import { compulsoryOffer } from "./fieldScript";

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
export type WindowId =
  | "walka"
  | "bestia"
  | "ruch"
  | "karty"
  | "obszar"
  | "przeprawa"
  | "most";

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
  /**
   * Standing at the Zamek Bestii with the Bestia still to be fought (14.7).
   *
   * Not an offer. "There is no leaving without it" — `dutiesBeforeEnding` says
   * so already and refuses to end the turn — so the window that starts it is
   * compulsory, and the box opens it rather than waiting to be asked. It was a
   * button behind a collapsed toggle in a strip beside the Karta, which is a
   * strange place for the end of the game.
   */
  beast: boolean;
}

/**
 * The facts, read straight off a turn state.
 *
 * `TurnFacts` stays a set of plain named facts so the reading above can be
 * tested against the rules rather than against a store — but *arriving* at
 * those facts is a reading of the rules too, and it was being done in the page
 * component where nothing tested it. A bug lived there: `crossingFrom` answers
 * `undefined` rather than null, and comparing against null was true for every
 * Obszar on the board, so the Karczma offered a Przeprawa.
 */
export function factsIn(state: TurnPhase, standingOn: FieldId | null): TurnFacts {
  const onField = state.phase === "field" ? state : null;
  const settled = onField?.resolved ?? [];
  return {
    phase: state.phase,
    standingOn,
    cardsWaiting: onField?.drawn.filter((card) => !settled.includes(card.cardId)).length ?? 0,
    fighting: state.phase === "fight",
    crossing: standingOn !== null && crossingFrom(standingOn) !== undefined,
    // Only while it is still to be done: once the fight is running it is the
    // `walka` window, and afterwards the game is over.
    beast: standingOn === "zamek-bestii" && state.phase !== "fight",
    ordeal: standingOn !== null && BRIDGE_ORDEAL.has(standingOn),
    demands: onField !== null && compulsoryOffer(standingOn, settled) !== null,
  };
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

  // 14.7, and the reason it comes before the cards: there is nothing to draw
  // at the Zamek and nothing else this turn can be about.
  if (facts.beast) {
    windows.push({ id: "bestia", label: "Bestia", compulsory: true });
  }

  // The die has been thrown and the character is standing between two roads.
  // Not an offer either: the turn cannot go anywhere else until it is answered,
  // and there is nothing else on the board to look at meanwhile.
  if (facts.phase === "move") {
    windows.push({ id: "ruch", label: "Ruch", compulsory: true });
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
  const canTryAgain = facts.phase === "field" || facts.phase === "roll";
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

/* --------------------------------------------------------------------------
 * How far through the turn you are.
 * ----------------------------------------------------------------------- */

/**
 * 10.1 says what a turn is made of: "a) ruch b) spotkania i badanie Obszaru,
 * na którym się znalazły" — and 10.2 splits the first into the roll and the
 * walk. Three steps, in that order, always.
 *
 * Worth drawing because the controls no longer say it. When the roll was a
 * panel that appeared and then a different panel appeared in its place, the
 * screen changing WAS the progress report; now that both are buttons in one
 * box, a player who looks away comes back to a box that looks much like it did
 * and cannot tell whether they have rolled.
 */
export type StepState = "zrobione" | "teraz" | "przed";

export interface TurnStep {
  label: string;
  state: StepState;
}

export function turnSteps(phase: string): TurnStep[] {
  // The Kamienny Most is not made of these: 10.3 has no roll at all there, one
  // Obszar a turn and an instruction to get through. Claiming a roll had
  // happened would be a lie, and claiming one was coming would be worse.
  if (phase === "bridge") return [{ label: "Most", state: "teraz" }];
  if (phase === "fight") return [{ label: "Walka", state: "teraz" }];

  const order = ["roll", "move", "field"];
  const at = phase === "end" ? order.length : order.indexOf(phase);
  if (at < 0) return [];

  return [
    { label: "Rzut", state: at > 0 ? "zrobione" : "teraz" },
    { label: "Ruch", state: at > 1 ? "zrobione" : at === 1 ? "teraz" : "przed" },
    { label: "Obszar", state: at > 2 ? "zrobione" : at === 2 ? "teraz" : "przed" },
  ];
}

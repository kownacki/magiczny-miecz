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
 * of the rules and not a question about React: a Wróg attacks the character who
 * turned him over (16.2), the Karczma's die is one of the instructions 13.5
 * says a Postać *must* obey, and 11.4 makes retrying a crossing the point of
 * the next turn.
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
   * character who turned him over (16.2), and the Karczma prints "MUSISZ RZUCIĆ
   * KOSTKĄ", which is 13.5's "do niektórych instrukcji Postać musi się
   * zastosować". The box opens a compulsory window rather than waiting to be
   * asked, which is what the draw modal already does for a fight.
   *
   * Compulsory is not immediate: `dutiesBeforeEnding` is what actually refuses,
   * at the end of the turn, and this only decides what opens by itself.
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
  phase: TurnPhase["phase"];
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
 * Order is the whole of the ranking a player needs. The Karty come before the
 * Obszar's own instruction because 13.5 puts them there — a square that draws
 * no Karty does its printed thing *after* everything lying on it, which is what
 * 12.1's worked example does on Ruchome Skały: Książę takes the Różdżka, draws
 * a Zaklęcie off it, and only then "musi zastosować się do instrukcji". Among
 * the Karty themselves the order is 15.1's placed ones, then 15.2's numerals
 * (16.4). A fight already under way comes before all of it.
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

  // 13.5: a non-drawing Obszar does its own printed thing after every Karta on
  // it, so the Karty are what the turn is on until they are gone. Not 16.4 —
  // that rule orders the Karty against *each other* ("Postać może przystąpić do
  // rozpatrzenia pozostałych Kart Zdarzeń") and says nothing about the square.
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

export function turnSteps(phase: TurnPhase["phase"]): TurnStep[] {
  // The Kamienny Most is not made of these: 10.3 has no roll at all there, one
  // Obszar a turn and an instruction to get through. Claiming a roll had
  // happened would be a lie, and claiming one was coming would be worse.
  if (phase === "bridge") return [{ label: "Most", state: "teraz" }];
  if (phase === "fight") return [{ label: "Walka", state: "teraz" }];

  const order = ["roll", "move", "field"];
  // A suspended card is the Obszar being dealt with, mid-sentence: the bar
  // stays on the step the player is actually in rather than going blank.
  const at = phase === "end" ? order.length : order.indexOf(phase === "script" ? "field" : phase);
  if (at < 0) return [];

  return [
    { label: "Rzut", state: at > 0 ? "zrobione" : "teraz" },
    { label: "Ruch", state: at > 1 ? "zrobione" : at === 1 ? "teraz" : "przed" },
    { label: "Obszar", state: at > 2 ? "zrobione" : at === 2 ? "teraz" : "przed" },
  ];
}

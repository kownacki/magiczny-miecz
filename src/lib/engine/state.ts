/** The game state the engine reads and returns, independent of how it is stored or rendered. */

import type { CardClass, Nature } from "@/data/types";

export type SeatId = string;

/**
 * One player's live state.
 *
 * `mieczOwn`/`magiaOwn` are the token-tracked points only. Rules 1.5 and 2.5
 * define the *total* as own points plus whatever items and friends contribute,
 * and that total is derived on read — never stored — so it cannot drift out of
 * step with the cards actually held. `mieczFloor`/`magiaFloor` capture 1.3 and
 * 2.3: own points may never drop below where the character started.
 */
export interface Seat {
  id: SeatId;
  index: number;
  name: string | null;
  characterId: string | null;
  fieldId: string | null;

  mieczOwn: number;
  magiaOwn: number;
  mieczFloor: number;
  magiaFloor: number;

  zycie: number;
  zloto: number;

  /** Nature can change mid-game (7.2), so it lives here rather than on the character. */
  nature: Nature | null;

  turnsLost: number;
  /** Set while Zamieniony w Kamień; clears after three turns (20.1). */
  stoneUntilTurn: number | null;
  eliminated: boolean;

  holdings: Holding[];
}

export interface Holding {
  cardId: string;
  kind: "spell" | "item" | "friend" | "trophy";
  /** Spells are held concealed (9.3); items and friends lie open (5.2, 6.2). */
  face: "open" | "hidden";
}

export interface GameState {
  id: string;
  mode: "companion" | "simulation";
  status: "lobby" | "playing" | "finished";
  turn: number;
  activeSeat: number | null;
  seats: Seat[];
  /** Cards left lying on fields (16.8), keyed by field id. */
  fieldCards: Record<string, string[]>;
}

/**
 * What the engine is waiting for. Returned after every applied move so the UI
 * never has to infer whose input is next.
 *
 * `reaction` is the one case where the waiting set is not just the active seat:
 * before a combat roll, *both* combatants may cast (17.7), and spells reach
 * their target wherever they stand on the board (9.6). The engine computes
 * which seats actually hold a castable spell and lists only those — most of the
 * time that set is empty and the window is skipped entirely, which is what
 * keeps the reaction rule from taxing every single turn.
 */
export type Waiting =
  | { kind: "move"; seat: number }
  | { kind: "choice"; seat: number; prompt: string; options: string[] }
  | { kind: "reaction"; seats: number[]; reason: string }
  | { kind: "finished"; winner: number };

export interface TurnCard {
  cardId: string;
  cardClass: CardClass;
}

/**
 * Rule 15.2: a field that makes you draw several cards resolves them in
 * ascending order of the class numeral printed at the top, lowest first. Rule
 * 16.4 adds that every Spotkanie and every Wróg on the field must be dealt with
 * before the rest are looked at, which this ordering already produces.
 *
 * Ties keep draw order, which is why this is a stable sort by class alone.
 */
export function resolutionOrder(cards: readonly TurnCard[]): TurnCard[] {
  const rank: Record<CardClass, number> = {
    spotkanie: 1,
    wrog: 2,
    nieznajomy: 3,
    przyjaciel: 4,
    przedmiot: 5,
    miejsce: 6,
  };
  return [...cards].sort((a, b) => rank[a.cardClass] - rank[b.cardClass]);
}

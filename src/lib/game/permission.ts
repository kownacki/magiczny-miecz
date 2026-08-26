/** Which seat may press which button, on whose turn. */

import type { GameRow, SeatRow } from "./store";

/**
 * The gate on the turn route, written down.
 *
 * "It is not your turn" sounds like one rule and is five, four of which are
 * exceptions to it. They lived as five booleans and a five-term negation in the
 * middle of a route handler, where the only way to ask what they did was to
 * read them — and where a sixth exception, added in a hurry, would look exactly
 * like the five already there.
 *
 * Each carries a rule number because each is one. Getting `isFlight` wrong
 * refuses the only player entitled to press the button; getting `isSpellWindow`
 * wrong closes a window that is only a window because everyone can reach it;
 * getting `isStuck` wrong strands a table with nobody able to move it on. None
 * of the three fails loudly.
 */
export interface Permission {
  /** Whether the request goes through at all. A refusal is 409, not 403. */
  allowed: boolean;
  /**
   * The shared screen in the middle of a companion table.
   *
   * Not a hole in the secrecy model: in companion mode every hidden thing is a
   * physical card in somebody's hand, and the app holds nothing worth keeping
   * from the people already sitting there. It is excluded in simulation, where
   * the app *does* hold each player's concealed spells (9.3) and one device
   * acting for everyone would expose them.
   *
   * Travels out because the caller needs it a second time: the table screen
   * flees as whoever is fleeing, a player's own device only as itself.
   */
  tableScreen: boolean;
}

export function mayAct(
  game: Pick<GameRow, "active_seat" | "mode">,
  seat: Pick<SeatRow, "seat_index" | "is_host">,
  action: unknown,
): Permission {
  const isActiveSeat = seat.seat_index === game.active_seat;
  const tableScreen = game.mode === "companion" && seat.is_host;
  // 17.7 is the one thing here a seat does on somebody else's turn: "przed
  // wykonaniem rzutu kostką obie Postacie mają możliwość użycia Zaklęć". A
  // window only the active player could close would not be a window.
  const isSpellWindow = action === "spell-claim" || action === "spell-release";
  // 17.6 is the other one: "Postać, która została zaatakowana, może próbować
  // wymknąć się przeciwnikowi". In a duel that is never the seat whose turn it
  // is, so refusing every other seat here would refuse the only player entitled
  // to press it. Which seat may actually flee is decided by `escape` itself,
  // against the fight in progress, rather than guessed at from the action name.
  const isFlight = action === "escape";
  /**
   * Nobody is playing, so anybody may move the game on.
   *
   * A table can arrive here with no active seat — every remaining character
   * owing a lost turn is the way, and Burza Siedmiu Słońc causes it outright.
   * `finishTurn` works through that now, but a game already sitting in the
   * state cannot reach `finishTurn` at all: every action is gated on being the
   * active seat, and there is no active seat to be.
   */
  const isStuck = game.active_seat === null && action === "end";

  return {
    allowed: isActiveSeat || tableScreen || isSpellWindow || isFlight || isStuck,
    tableScreen,
  };
}

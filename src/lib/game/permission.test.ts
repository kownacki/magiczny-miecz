import { describe, expect, it } from "vitest";
import { mayAct } from "./permission";
import { aSeat, aTable } from "./fixture";

/**
 * "It is not your turn" is one sentence and five rules.
 *
 * Four of them are exceptions, and every one fails quietly in the direction
 * nobody notices: a window that only the active player can reach is not a
 * window, a flight refused to everyone but the attacker is refused to the only
 * person entitled to it, and a table with no active seat that also lets nobody
 * end a turn is a table that has stopped.
 */

const playing = (over = {}) => aTable({ game: { active_seat: 0, ...over } }).game;
const active = aSeat({ seat_index: 0, is_host: true });
const waiting = aSeat({ id: "seat-b", seat_index: 1, is_host: false });

describe("the seat whose turn it is", () => {
  it("may do anything", () => {
    for (const action of ["roll", "move", "draw", "fight", "end"]) {
      expect(mayAct(playing(), active, action).allowed).toBe(true);
    }
  });

  it("is decided on the index, not on the row", () => {
    // `active_seat` is a seat *index*, and a seat id would compare false
    // against every one of them forever.
    expect(mayAct(playing({ active_seat: 1 }), waiting, "roll").allowed).toBe(true);
    expect(mayAct(playing({ active_seat: 1 }), active, "roll").allowed).toBe(false);
  });
});

describe("a seat waiting its turn", () => {
  it("is refused the ordinary actions", () => {
    for (const action of ["roll", "move", "draw", "fight", "end", "fight-done"]) {
      expect(mayAct(playing(), waiting, action).allowed).toBe(false);
    }
  });

  it("may still ask for the moment before the dice (17.7)", () => {
    // "przed wykonaniem rzutu kostką obie Postacie mają możliwość użycia
    // Zaklęć" — both of them, which is the whole point of the window.
    expect(mayAct(playing(), waiting, "spell-claim").allowed).toBe(true);
    expect(mayAct(playing(), waiting, "spell-release").allowed).toBe(true);
  });

  it("may try to flee, because in a duel it is never the attacker who flees (17.6)", () => {
    // Which seat may actually flee is `escape`'s to decide, against the fight
    // in progress. This only declines to guess it from the action name.
    expect(mayAct(playing(), waiting, "escape").allowed).toBe(true);
  });

  it("may not end somebody else's turn while somebody is playing", () => {
    expect(mayAct(playing(), waiting, "end").allowed).toBe(false);
  });
});

describe("a table with nobody playing", () => {
  /**
   * Every remaining character owing a lost turn does it, and Burza Siedmiu
   * Słońc does it outright. `finishTurn` works through the state, but a game
   * already sitting in it could not reach `finishTurn` at all: every action was
   * gated on being the active seat, and there was no active seat to be.
   */
  it("lets anybody move it on", () => {
    expect(mayAct(playing({ active_seat: null }), waiting, "end").allowed).toBe(true);
    expect(mayAct(playing({ active_seat: null }), active, "end").allowed).toBe(true);
  });

  it("does not let that become a licence to play out of turn", () => {
    for (const action of ["roll", "move", "draw", "fight"]) {
      expect(mayAct(playing({ active_seat: null }), waiting, action).allowed).toBe(false);
    }
  });

  it("is not the same as a seat index of zero", () => {
    // `active_seat` is a number that is falsy on the first seat, and `null` is
    // the only value meaning nobody.
    expect(mayAct(playing({ active_seat: 0 }), waiting, "end").allowed).toBe(false);
  });
});

describe("the shared screen in the middle of a companion table", () => {
  const shared = { mode: "companion" };

  it("acts for whoever is playing", () => {
    expect(mayAct(playing(shared), aSeat({ seat_index: 3, is_host: true }), "roll")).toEqual({
      allowed: true,
      tableScreen: true,
    });
  });

  /**
   * Not a hole in the secrecy model, and only not a hole in companion mode.
   *
   * There every hidden thing is a physical card in somebody's hand and the app
   * holds nothing worth keeping from the people already in the room. In
   * simulation it holds each player's concealed spells (9.3), and one device
   * acting for everyone would be one device that could read them.
   */
  it("does not exist in simulation, however much of a host the seat is", () => {
    expect(mayAct(playing({ mode: "simulation" }), waiting, "roll")).toEqual({
      allowed: false,
      tableScreen: false,
    });
    const hostWaiting = aSeat({ seat_index: 1, is_host: true });
    expect(mayAct(playing({ mode: "simulation" }), hostWaiting, "roll")).toEqual({
      allowed: false,
      tableScreen: false,
    });
  });

  it("is not every seat at a companion table", () => {
    expect(mayAct(playing(shared), waiting, "roll")).toEqual({
      allowed: false,
      tableScreen: false,
    });
  });

  /**
   * `tableScreen` travels out because the caller needs it again.
   *
   * The shared screen flees as whoever is fleeing; a player's own device may
   * only flee with its own character. Both are allowed to press the button, so
   * the verdict alone cannot tell the route which it is talking to.
   */
  it("says which of the two allowed a flight is", () => {
    const host = aSeat({ seat_index: 3, is_host: true });
    expect(mayAct(playing(shared), host, "escape")).toEqual({
      allowed: true,
      tableScreen: true,
    });
    expect(mayAct(playing({ mode: "simulation" }), waiting, "escape")).toEqual({
      allowed: true,
      tableScreen: false,
    });
  });
});

describe("an action nobody recognises", () => {
  it("is refused to a waiting seat like any other", () => {
    // The unknown-action 400 is the route's, and it is behind this gate: a
    // seat that may not act must not learn which actions exist.
    expect(mayAct(playing(), waiting, "zjedz-smoka").allowed).toBe(false);
    expect(mayAct(playing(), waiting, undefined).allowed).toBe(false);
    expect(mayAct(playing(), waiting, null).allowed).toBe(false);
  });

  it("reaches the active seat, which is where it gets its 400", () => {
    expect(mayAct(playing(), active, "zjedz-smoka").allowed).toBe(true);
  });
});

/** 5.6's "natychmiast", as a frame the whole table waits on (docs/STACK.md). */

import {
  closeOverflow,
  openOverflow,
  overflowIn,
  overflowOnTop,
  waysUnder,
  type Overflow,
  type OverflowFrame,
  type WayUnder,
} from "@/lib/engine/overflow";
import { plural } from "@/lib/engine/polish";
import { isUsable } from "@/lib/engine/uses";
import { startingKit, asCharacterId } from "@/lib/engine/characters";
import { apply, type Changeset, type Snapshot } from "../change";
import { eqModeOf, holdingsOf, seatView } from "./seat";

/**
 * Whether one seat is over either of its limits, and by how much.
 *
 * Asked of `seatView` rather than of the row, because both limits are computed:
 * the pack's off what is held (a Koń lends carrying) and the hand's off 2.6's
 * table against a Magia that Przedmioty and an Obszar can both move. A seat can
 * therefore go over without gaining anything at all — walking onto the
 * Zaczarowane Wzgórza is 2.6's own worked example.
 */
export function overflowOf(snapshot: Snapshot, seatId: string): Overflow | null {
  const view = seatView(snapshot, seatId);
  const row = snapshot.seats.find((seat) => seat.id === seatId);
  if (!row || row.eliminated || !row.character_id) return null;
  return overflowIn(holdingsOf(snapshot, seatId), eqModeOf(snapshot.game), {
    magia: view.parametr.magia,
    atSetup: startingKit(asCharacterId(row.character_id)).spells ?? 0,
    abilities: view.abilities,
    // The cap `seatView` settled, rather than a second reckoning of it here.
    // The two agreed until the console could switch 2.6 off, and then this end
    // went on enforcing a limit the rest of the app had stopped drawing.
    allowed: view.spellCapacity,
  });
}

/**
 * The first seat at the table that is over, in seat order.
 *
 * One at a time on purpose. Two players can be over at once — a Wojna Żywiołów
 * suspends every Magiczny Przedmiot and two Magowie lose a Zaklęcie apiece —
 * and the frame holds one seat, so the second surfaces the moment the first is
 * settled. Which is the right shape anyway: a stack of two questions is two
 * questions, and answering them in seat order is an order everybody can follow.
 */
export function whoIsOver(snapshot: Snapshot): { seatId: string; over: Overflow } | null {
  for (const row of [...snapshot.seats].sort((a, b) => a.seat_index - b.seat_index)) {
    const over = overflowOf(snapshot, row.id);
    if (over) return { seatId: row.id, over };
  }
  return null;
}

/**
 * Everything this seat could do about it, right now.
 *
 * Read fresh every time rather than stored on the frame, because using a card
 * changes the answer: drinking the Eliksir spends it, and what is left to
 * choose from is a different list. A frame holding a remedy would be a frame
 * that had to be rewritten by every act that is not the remedy.
 */
export function waysOut(snapshot: Snapshot, seatId: string): WayUnder[] {
  const over = overflowOf(snapshot, seatId);
  if (!over) return [];
  const view = seatView(snapshot, seatId);
  // The row id travels with the card, because two Hełmy are two rows and a way
  // out has to name which of them. `holdingsOf` drops it on the way to the pure
  // `Holding`, so it is put back from the rows themselves.
  const rows = snapshot.holdings.filter((row) => row.seat_id === seatId);
  const held = holdingsOf(snapshot, seatId).map((one, at) => ({ ...one, id: rows[at].id }));
  return waysUnder(
    held,
    eqModeOf(snapshot.game),
    view.nature,
    over.what,
    isUsable,
  );
}

/**
 * Opens the frame if anybody is over, on the state as it will be.
 *
 * Chained through `apply` for the reason CLAUDE.md gives about `merge`: this
 * reads the very columns the caller is writing — a Karta granted, a Koń
 * dropped, a Magia moved — so asking the stored snapshot would answer about the
 * table before the change that caused the surplus.
 *
 * Idempotent: a frame already on top is left where it is rather than stacked
 * on itself, so a second write while the table is waiting does not bury the
 * first question under a copy of itself.
 */
export function holdOverflow(snapshot: Snapshot, soFar: Changeset = {}): Changeset {
  const after = apply(snapshot, soFar);
  if (overflowOnTop(after.game.turn_state)) return {};
  const found = whoIsOver(after);
  if (!found) return {};
  return {
    game: {
      turn_state: openOverflow(after.game.turn_state, {
        phase: "overflow",
        seatId: found.seatId,
        what: found.over.what,
      }),
    },
  };
}

/**
 * Closes the frame once the seat it names is back under.
 *
 * The counterpart, and deliberately not a command of its own: the ways out are
 * verbs the app already has — drop a Karta, spend one, put one on — so what the
 * frame needs is not a fourth way to move a card but a check after each of the
 * three. 5.4 hands the choice to the player and says nothing about the method,
 * and neither does this.
 *
 * If the seat is still over, nothing happens and the table keeps waiting: a
 * player four Przedmioty over answers four times.
 *
 * If a *different* seat is now the problem — dropping a Koń on the Obszar you
 * share does not happen, but a Zaklęcie handed over does — the frame is
 * reopened on them rather than left naming somebody who is fine.
 */
export function releaseOverflow(snapshot: Snapshot, soFar: Changeset = {}): Changeset {
  const after = apply(snapshot, soFar);
  const frame = overflowOnTop(after.game.turn_state);
  if (!frame) return {};
  if (overflowOf(after, frame.seatId)) return {};

  const closed = closeOverflow(after.game.turn_state);
  const next = whoIsOver(after);
  return {
    game: {
      turn_state: next
        ? openOverflow(closed, { phase: "overflow", seatId: next.seatId, what: next.over.what })
        : closed,
    },
  };
}

/**
 * The refusal every other verb owes the frame.
 *
 * "Zanim gra ruszy dalej" is the whole of it: while a surplus is on the stack
 * the only acts that mean anything are the ones that end it, and those are
 * asked of the seat the frame names. Everybody else — including whoever's turn
 * it is, when the two are not the same person — waits.
 */
/**
 * What there is too much of, counted and named.
 *
 * The number on its own said "26 za dużo" to somebody who had just asked for a
 * Nieznajomy, which reads as nonsense until you know it is about a *hand* and
 * not about the card being asked for. The kind is the word that connects them,
 * and the frame has carried it all along without ever saying it.
 */
function tooMany(what: OverflowFrame["what"], over: number): string {
  return what === "przedmioty"
    ? `${over} ${plural(over, "Przedmiot", "Przedmioty", "Przedmiotów")}`
    : `${over} ${plural(over, "Zaklęcie", "Zaklęcia", "Zaklęć")}`;
}

/**
 * The ways back under, which are not the same ways for the two kinds.
 *
 * This offered "odrzucić Kartę, użyć jej albo założyć (5.4)" for both, and for
 * a hand of Zaklęcia every clause of it is wrong: nobody wears a Zaklęcie,
 * 5.4 is about carrying Przedmioty and has nothing to say about Magia, and the
 * rule that lets an over-full hand shed one at all is 9.4 — which is the number
 * `dropCard`'s own refusal already cites when it stops you shedding one you are
 * allowed to keep.
 */
function waysBack(what: OverflowFrame["what"]): string {
  return what === "przedmioty"
    ? "Możesz odrzucić Kartę, użyć jej albo założyć (5.4)."
    : // „albo je rzucić" was here and was wrong twice over. `waysUnder` has
      // never offered casting as a way under — it returns `odrzuc` for a spell
      // and nothing else — and `castSpell` now refuses while the frame is up,
      // for the reason written there: 2.6's *natychmiast* comes before an act
      // that lands on somebody else's Postać (9.6). A hand over the limit has
      // exactly one thing it can do, and saying so is what makes the refusal
      // one a player acts on rather than argues with.
      "Możesz odrzucić Zaklęcie (9.4).";
}

export function refuseWhileOverflow(snapshot: Snapshot, seatId: string | null): void {
  const frame = overflowOnTop(snapshot.game.turn_state);
  if (!frame) return;
  const over = overflowOf(snapshot, frame.seatId);
  const who = snapshot.seats.find((seat) => seat.id === frame.seatId);
  const rule = frame.what === "przedmioty" ? "5.6" : "2.6";
  const much = tooMany(frame.what, over?.over ?? 1);
  if (seatId !== frame.seatId) {
    throw new Error(
      `Miejsce ${(who?.seat_index ?? 0) + 1} ma o ${much} za dużo — gra czeka, aż zejdzie do limitu (${rule}).`,
    );
  }
  /**
   * "Gra czeka" on this branch too, which is the half that was missing.
   *
   * "Najpierw zejdź do limitu" reads as an answer about the thing you just
   * typed, so a Nieznajomy refused over a hand of Zaklęcia looked like a bug in
   * `deal`. It is not: the surplus is 5.6's „natychmiast" and the whole table
   * is stopped on it, whatever anybody asks for next. Saying so is the
   * difference between a refusal you argue with and one you act on.
   */
  throw new Error(
    `Gra czeka: masz o ${much} za dużo (${rule}). ${waysBack(frame.what)}`,
  );
}
